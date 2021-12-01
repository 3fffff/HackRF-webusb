class ComplexFirFilter {
	/**
	 * Private Constructor. Creates a new complex FIR Filter with the given taps and decimation.
	 * Use create*Filter() to calculate taps and create the filter.
	 * @param tapsReal				filter taps real part
	 * @param tapsImag				filter taps imaginary part
	 * @param decimation			decimation factor
	 * @param gain					filter pass band gain
	 * @param lowCutOffFrequency	lower cut off frequency (start of pass band)
	 * @param highCutOffFrequency	upper cut off frequency (end of pass band)
	 * @param transitionWidth		width from end of pass band to start stop band
	 * @param attenuation			attenuation of stop band
	 */
    constructor(tapsReal, tapsImag, decimation, gain, sampleRate, lowCutOffFrequency,
        highCutOffFrequency, transitionWidth, attenuation) {
        if (tapsReal.length != tapsImag.length)
            throw new IllegalArgumentException("real and imag filter taps have to be of the same length!");
        this.tapsReal = tapsReal;
        this.tapsImag = tapsImag;
        this.delaysReal = new Array[tapsReal.length];
        this.delaysImag = new Array[tapsImag.length];
        this.decimation = decimation;
        this.gain = gain;
        this.lowCutOffFrequency = lowCutOffFrequency;
        this.highCutOffFrequency = highCutOffFrequency;
        this.transitionWidth = transitionWidth;
        this.attenuation = attenuation;
        this.sampleRate = sampleRate;
        this.tapCounter = 0;
        this.decimationCounter = 1;
    }

	/**
	 * Filters the samples from the input sample packet and appends filter output to the output
	 * sample packet. Stops automatically if output sample packet is full.
	 * @param in		input sample packet
	 * @param out		output sample packet
	 * @param offset	offset to use as start index for the input packet
	 * @param length	max number of samples processed from the input packet
	 * @return number of samples consumed from the input packet
	 */
    filter(input) {
        let output = (s => { let a = []; while (s-- > 0) a.push(new complex()); return a; })(input.length);
        // insert each input sample into the delay line:
        for (let i = 0; i < input.length; i++) {
            this.delaysReal[this.tapCounter] = input[i].real;
            this.delaysImag[this.tapCounter] = input[i].imag;

            // Calculate the filter output for every Mth element (were M = decimation)
            if (this.decimationCounter == 0) {
                // Calculate the results:
                let index = tapCounter;
                for (let j = 0; j < this.tapsReal.length; j++) {
                    output[i].real += this.tapsReal[j] * this.delaysReal[index] - this.tapsImag[j] * this.delaysImag[index];
                    output[i].imag += this.tapsImag[j] * this.delaysReal[index] + this.tapsReal[j] * this.delaysImag[index];
                    index--;
                    if (index < 0) index = this.tapsReal.length - 1;
                }
            }

            // update counters:
            this.decimationCounter++;
            if (this.decimationCounter >= decimation)
                this.decimationCounter = 0;
            this.tapCounter++;
            if (this.tapCounter >= this.tapsReal.length)
                this.tapCounter = 0;
        }
        return output;			// We return the number of consumed samples from the input buffers
    }

	/**
	 * FROM GNU Radio firdes::band_pass_2:
	 *
	 * Will calculate the tabs for the specified low pass filter and return a FirFilter instance
	 *
	 * @param decimation			decimation factor
	 * @param gain					filter pass band gain
	 * @param sampling_freq			sample rate
	 * @param low_cutoff_freq		cut off frequency (beginning of pass band)
	 * @param high_cutoff_freq		cut off frequency (end of pass band)
	 * @param transition_width		width from end of pass band to start stop band
	 * @param attenuation_dB		attenuation of stop band
	 * @return instance of FirFilter
	 */
    static createBandPass(decimation,
        gain,
        sampling_freq,    // Hz
        low_cutoff_freq,      // Hz BEGINNING of transition band
        high_cutoff_freq,      // Hz END of transition band
        transition_width, // Hz width of transition band
        attenuation_dB)   // attenuation dB
    {
        if (sampling_freq <= 0.0) {
            console.log("createBandPass: firdes check failed: sampling_freq > 0");
            return null;
        }

        if (low_cutoff_freq < sampling_freq * -0.5 || high_cutoff_freq > sampling_freq * 0.5) {
            console.log("createBandPass: firdes check failed: -sampling_freq / 2 < fa <= sampling_freq / 2");
            return null;
        }

        if (low_cutoff_freq >= high_cutoff_freq) {
            console.log("createBandPass: firdes check failed: low_cutoff_freq >= high_cutoff_freq");
            return null;
        }

        if (transition_width <= 0) {
            console.log("createBandPass: firdes check failed: transition_width > 0");
            return null;
        }

        // Calculate number of tabs
        // Based on formula from Multirate Signal Processing for
        // Communications Systems, fredric j harris
        let ntaps = (attenuation_dB * sampling_freq / (22.0 * transition_width));
        if ((ntaps & 1) == 0)	// if even...
            ntaps++;		// ...make odd

        // construct the truncated ideal impulse response
        // [sin(x)/x for the low pass case]
        // Note: we calculate the real taps for a low pass and shift them
        let low_pass_cut_off = (high_cutoff_freq - low_cutoff_freq) / 2;
        let tapsLowPass = new Array[ntaps];
        let w = Fourier.makeWindow(ntaps);

        let M = (ntaps - 1) / 2;
        let fwT0 = 2 * Math.PI * low_pass_cut_off / sampling_freq;
        for (let n = -M; n <= M; n++) {
            if (n == 0)
                tapsLowPass[n + M] = fwT0 / Math.PI * w[n + M];
            else {
                // a little algebra gets this into the more familiar sin(x)/x form
                tapsLowPass[n + M] = Math.sin(n * fwT0) / (n * Math.PI) * w[n + M];
            }
        }

        // find the factor to normalize the gain, fmax.
        // For low-pass, gain @ zero freq = 1.0
        let fmax = tapsLowPass[0 + M];
        for (let n = 1; n <= M; n++)
            fmax += 2 * tapsLowPass[n + M];
        let actualGain = gain / fmax;    // normalize
        for (let i = 0; i < ntaps; i++)
            tapsLowPass[i] *= actualGain;

        // calc the band pass taps:
        let tapsReal = new Array[ntaps];
        let tapsImag = new Array[ntaps];
        let freq = Math.PI * (high_cutoff_freq + low_cutoff_freq) / sampling_freq;
        let phase = - freq * (ntaps / 2);

        for (let i = 0; i < ntaps; i++) {
            tapsReal[i] = tapsLowPass[i] * Math.cos(phase);
            tapsImag[i] = tapsLowPass[i] * Math.sin(phase);
            phase += freq;
        }

        return new ComplexFirFilter(tapsReal, tapsImag, decimation, gain, sampling_freq, low_cutoff_freq, high_cutoff_freq, transition_width, attenuation_dB);
    }
}