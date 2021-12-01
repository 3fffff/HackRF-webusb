class FirFilter {
    constructor(taps, decimation, gain, sampleRate, cutOffFrequency, transitionWidth, attenuation) {
        if (this.taps === undefined) this.taps = null;
        if (this.delaysReal === undefined) this.delaysReal = null;
        if (this.delaysImag === undefined) this.delaysImag = null;
        if (this.decimation === undefined) this.decimation = 0;
        if (this.gain === undefined) this.gain = 0;
        if (this.sampleRate === undefined) this.sampleRate = 0;
        if (this.cutOffFrequency === undefined) this.cutOffFrequency = 0;
        if (this.transitionWidth === undefined) this.transitionWidth = 0;
        if (this.attenuation === undefined) this.attenuation = 0;
        this.taps = taps;
        this.delaysReal = (s => { let a = []; while (s-- > 0) a.push(0); return a; })(taps.length);
        this.delaysImag = (s => { let a = []; while (s-- > 0) a.push(0); return a; })(taps.length);
        this.decimation = decimation;
        this.gain = gain;
        this.sampleRate = sampleRate;
        this.cutOffFrequency = cutOffFrequency;
        this.transitionWidth = transitionWidth;
        this.attenuation = attenuation;
        this.decimationCounter = 0
        this.tapCounter = 0
    }
    /**
     * Filters the samples from the input sample packet and appends filter output to the output
     * sample packet. Stops automatically if output sample packet is full.
     */
    filter(input) {
        let output = (s => { let a = []; while (s-- > 0) a.push(new complex()); return a; })(input.length / this.decimation);
        for (let i = 0; i < input.length; i++) {
            this.delaysReal[this.tapCounter] = input[i].real;
            this.delaysImag[this.tapCounter] = input[i].imag;
            if (this.decimationCounter === 0) {
                let index = this.tapCounter;
                for (let index1 = 0; index1 < this.taps.length; index1++) {
                    let tap = this.taps[index1];
                    output[i / this.decimation].real += tap * this.delaysReal[index];
                    output[i / this.decimation].imag += tap * this.delaysImag[index];
                    index--;
                    if (index < 0) index = this.taps.length - 1;
                }
            }
            this.decimationCounter++;
            if (this.decimationCounter >= this.decimation) this.decimationCounter = 0;
            this.tapCounter++;
            if (this.tapCounter >= this.taps.length) this.tapCounter = 0;
        }
        return output
    }

    /**
     * Filters the real parts of the samples from the input sample packet and appends filter output to the output
     * sample packet. Stops automatically if output sample packet is full.
     */
    filterReal(input) {
        let output = (s => { let a = []; while (s-- > 0) a.push(new complex()); return a; })(input.length);
        for (let i = 0; i < input.length; i++) {
            this.delaysReal[this.tapCounter] = input[i].real;
            if (this.decimationCounter === 0) {
                let index = this.tapCounter;
                for (let index13154 = 0; index13154 < this.taps.length; index13154++) {
                    let tap = this.taps[index13154];
                    output[i].real += tap * this.delaysReal[index];
                    index--;
                    if (index < 0) index = this.taps.length - 1;
                }
            }
            this.decimationCounter++;
            if (this.decimationCounter >= this.decimation) this.decimationCounter = 0;
            this.tapCounter++;
            if (this.tapCounter >= this.taps.length) this.tapCounter = 0;
        }
        return output;
    }

    /**
     * FROM GNU Radio firdes::low_pass_2:
     * 
     * Will calculate the tabs for the specified low pass filter and return a FirFilter instance
     * 
     * @param {number} decimation			decimation factor
     * @param {number} gain					filter pass band gain
     * @param {number} sampling_freq			sample rate
     * @param {number} cutoff_freq			cut off frequency (end of pass band)
     * @param {number} transition_width		width from end of pass band to start stop band
     * @param {number} attenuation_dB		attenuation of stop band
     * @return {FirFilter} instance of FirFilter
     */
    static createLowPass(decimation, gain, sampling_freq, cutoff_freq, transition_width, attenuation_dB) {
        if (sampling_freq <= 0.0) {
            return null;
        }
        if (cutoff_freq <= 0.0 || cutoff_freq > sampling_freq / 2) {
            return null;
        }
        if (transition_width <= 0) {
            return null;
        }
        let ntaps = ((attenuation_dB * sampling_freq / (22.0 * transition_width)) | 0);
        if ((ntaps & 1) === 0) ntaps++;
        let taps = (s => { let a = []; while (s-- > 0) a.push(0); return a; })(ntaps);
        let w = Fourier.MakeWindow('Blackman', ntaps);
        let M = ((ntaps - 1) / 2 | 0);
        let fwT0 = 2 * Math.PI * cutoff_freq / sampling_freq;
        for (let n = -M; n <= M; n++) {
            if (n === 0) taps[n + M] = fwT0 / Math.PI * w[n + M]; else {
                taps[n + M] = Math.sin(n * fwT0) / (n * Math.PI) * w[n + M];
            }
        }
        let fmax = taps[0 + M];
        for (let n = 1; n <= M; n++) { fmax += 2 * taps[n + M]; }
        let actualGain = gain / fmax;
        for (let i = 0; i < ntaps; i++) { taps[i] *= actualGain; }
        return new FirFilter(taps, decimation, gain, sampling_freq, cutoff_freq, transition_width, attenuation_dB);
    }
}