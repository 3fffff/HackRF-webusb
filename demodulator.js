class demodulator {
	static AUDIO_RATE = 31250;	// Even though this is not a proper audio rate, the Android system can
	// handle it properly and it is a integer fraction of the input rate (1MHz).
	// The quadrature rate is the sample rate that is used for the demodulation:
	static QUADRATURE_RATE = [1,				// off; this value is not 0 to avoid divide by zero errors!
		2 * demodulator.AUDIO_RATE,	// AM
		2 * demodulator.AUDIO_RATE,	// nFM
		8 * demodulator.AUDIO_RATE,	// wFM
		2 * demodulator.AUDIO_RATE,	// LSB
		2 * demodulator.AUDIO_RATE];	// USB
	static INPUT_RATE = 1000000;	// Expected rate of the incoming samples
	outputSamples = Array()

	// DECIMATION
	decimator;	// will do INPUT_RATE --> QUADRATURE_RATE

	// FILTERING (This is the channel filter controlled by the user)
	static USER_FILTER_ATTENUATION = 20;
	userFilter;
	userFilterCutOff = 0;
	quadratureSamples;
	static MIN_USER_FILTER_WIDTH = [0,		// off
		3000,	// AM
		3000,	// nFM
		50000,	// wFM
		1500,	// LSB
		1500];	// USB
	static MAX_USER_FILTER_WIDTH = [0,		// off
		15000,	// AM
		15000,	// nFM
		120000,	// wFM
		5000,	// LSB
		5000];  // USB

	// DEMODULATION
	demodulatorHistory;	// used for FM demodulation
	lastMax = 0;	// used for gain control in AM / SSB demodulation
	bandPassFilter;	// used for SSB demodulation
	static BAND_PASS_ATTENUATION = 40;
	static DEMODULATION_OFF = 0;
	static DEMODULATION_AM = 1;
	static DEMODULATION_NFM = 2;
	static DEMODULATION_WFM = 3;
	static DEMODULATION_LSB = 4;
	static DEMODULATION_USB = 5;

	audioBuffer;

	demodulationMode = 0;

	// AUDIO OUTPUT
	audioSink;		// Will do QUADRATURE_RATE --> AUDIO_RATE and audio output

	/**
	 * Constructor. Creates a new demodulator block reading its samples from the given input queue and
	 * returning the buffers to the given output queue. Expects input samples to be at baseband (mixing
	 * is done by the scheduler)
	 *
	 * @param packetSize	Size of the packets in the input queue
	 */
	constructor(packetSize, sampleRate) {
		// Create internal sample buffers:
		// Note that we create the buffers for the case that there is no downsampling necessary
		// All other cases with input decimation > 1 are also possible because they only need
		// smaller buffers.
		this.quadratureSamples = Array(packetSize);
		this.sampleRate = sampleRate

		// Create Audio Sink
		this.audioSink = new audioSink(this.packetSize, demodulator.AUDIO_RATE);

		// Create Decimator block
		// Note that the decimator directly reads from the inputQueue and also returns processed packets to the
		// output queue.
		this.decimator = new Decimator(demodulator.INPUT_RATE, demodulator.QUADRATURE_RATE[this.demodulationMode]);
	}

	/**
	 * Sets a new demodulation mode. This can be done while the demodulator is running!
	 * Will automatically adjust internal sample rate conversions and the user filter
	 * if necessary
	 *
	 * @param this.demodulationMode	Demodulation Mode (DEMODULATION_OFF, *_AM, *_NFM, *_WFM, ...)
	 */
	setDemodulationMode(demodulationMode) {
		if (this.demodulationMode > 5 || this.demodulationMode < 0) {
			console.log("setDemodulationMode: invalid mode: " + this.demodulationMode);
			return;
		}
		this.decimator.setOutputSample(demodulator.QUADRATURE_RATE[demodulationMode]);
		this.demodulationMode = demodulationMode;
		this.userFilterCutOff = (demodulator.MAX_USER_FILTER_WIDTH[demodulationMode] + demodulator.MIN_USER_FILTER_WIDTH[demodulationMode]) / 2;
	}

	/**
	 * Will set the cut off frequency of the user filter
	 * @param channelWidth	channel width (single side) in Hz
	 * @return true if channel width is valid, false if out of range
	 */
	setChannelWidth(channelWidth) {
		if (channelWidth < demodulator.MIN_USER_FILTER_WIDTH[this.demodulationMode] || channelWidth > demodulator.MAX_USER_FILTER_WIDTH[this.demodulationMode])
			return false;
		this.userFilterCutOff = channelWidth;
		return true;
	}

	/**
	 * @return Current width (cut-off frequency - one sided) of the user filter
	 */


	run(inputSamples) {
		// Get downsampled packet from the decimator:
		if (this.demodulationMode == demodulator.DEMODULATION_OFF || typeof inputSamples === 'undefined')
			return

		this.outputSamples = this.decimator.downsampling(inputSamples);

		// Verify the input sample packet is not null:
		if (this.outputSamples.length == 0) {
			console.log("run: Decimated sample is null. skip this round...");
			return;
		}

		// filtering		[sample rate is QUADRATURE_RATE]
		let outFilter = this.applyUserFilter(this.outputSamples);		// The result from filtering is stored in this.quadratureSamples
		if (typeof outFilter === 'undefined') return

		// return input samples to the decimator block:
		let output = this.decimator.downsampling(outFilter);


		// demodulate		[sample rate is QUADRATURE_RATE]
		switch (this.demodulationMode) {
			case demodulator.DEMODULATION_AM:
				this.audioBuffer = this.demodulateAM(output);
				break;

			case demodulator.DEMODULATION_NFM:
				this.audioBuffer = this.demodulateFM(output, 5000);
				break;

			case demodulator.DEMODULATION_WFM:
				this.audioBuffer = this.demodulateFM(output, 75000);
				console.log(this.audioBuffer)
				break;

			case demodulator.DEMODULATION_LSB:
				this.audioBuffer = this.demodulateSSB(output, false);
				break;

			case demodulator.DEMODULATION_USB:
				this.audioBuffer = this.demodulateSSB(output, true);
				break;

			default:
				console.log("run: invalid this.demodulationMode: " + this.demodulationMode);
		}
	}

	/**
	 * Will filter the samples in input according to the user filter settings.
	 * Filtered samples are stored in output. Note: All samples in output
	 * will always be overwritten!
	 *
	 * @param input		incoming (unfiltered) samples
	 * @param output	outgoing (filtered) samples
	 */
	applyUserFilter(input) {
		// Verify that the filter is still correct configured:
		if (this.userFilter == null || (this.userFilter.cutOffFrequency) != this.userFilterCutOff) {
			// We have to (re-)create the user filter:
			this.userFilter = FirFilter.createLowPass(1, 1, demodulator.QUADRATURE_RATE[this.demodulationMode],
				this.userFilterCutOff, demodulator.QUADRATURE_RATE[this.demodulationMode] * 0.10, demodulator.USER_FILTER_ATTENUATION);
			if (this.userFilter == null) return;	// This may happen if input samples changed rate or demodulation was turned off. Just skip the filtering.
			console.log("applyUserFilter: created new user filter with " + this.userFilter.taps.length
				+ " taps. Decimation=" + this.userFilter.decimation + " Cut-Off=" + this.userFilter.cutOffFrequency
				+ " transition=" + this.userFilter.transitionWidth)
		}
		return this.userFilter.filter(input)
	}

	/**
	 * Will FM demodulate the samples in input. Use ~75000 deviation for wide band FM
	 * and ~3000 deviation for narrow band FM.
	 * Demodulated samples are stored in the real array of output. Note: All samples in output
	 * will always be overwritten!
	 */
	demodulateFM(input, maxDeviation) {
		let quadratureGain = demodulator.QUADRATURE_RATE[this.demodulationMode] / (2 * Math.PI * maxDeviation);
		let output = Array(input.length);
		if (this.demodulatorHistory == null) {
			this.demodulatorHistory = new complex(input.real, output.real)
		}

		// Quadrature demodulation:
		output[0] = new complex(input[0].real * this.demodulatorHistory.real + input[0].imag * this.demodulatorHistory.imag,
			input[0].imag * this.demodulatorHistory.real - input[0].real * this.demodulatorHistory.imag)
		output[0].real = quadratureGain * Math.atan2(output[0].imag, output[0].real);
		for (let i = 1; i < input.length; i++) {
			output[i] = new complex(input[i].real * input[i - 1].real + input[i].imag * input[i - 1].imag,
				input[i].imag * input[i - 1].real - input[i].real * input[i - 1].imag)
			output[i].real = quadratureGain * Math.atan2(output[i].imag, output[i].real);
		}
		this.demodulatorHistory.real = input[input.length - 1].real;
		this.demodulatorHistory.imag = input[input.length - 1].imag;
		return output
	}

	/**
	 * Will AM demodulate the samples in input.
	 * Demodulated samples are stored in the real array of output. Note: All samples in output
	 * will always be overwritten!
	 *
	 * @param input		incoming (modulated) samples
	 * @param output	outgoing (demodulated) samples
	 */
	demodulateAM(input) {
		let avg = 0;
		this.lastMax *= 0.95;	// simplest AGC
		let output = Array(input.length)

		// complex to magnitude
		for (let i = 0; i < input.length; i++) {
			output[i].real = (input[i].real * input[i].real + input[i].imag * input[i].imag);
			avg += output[i].real[i];
			if (output[i].real > this.lastMax)
				this.lastMax = output[i].real;
		}
		avg = avg / input.length;

		// normalize values:
		let gain = 0.75 / this.lastMax;
		for (let i = 0; i < output.length; i++)
			output[i].real = (output[i].real - avg) * gain;
		return output
	}

	/**
	 * Will SSB demodulate the samples in input.
	 * Demodulated samples are stored in the real array of output. Note: All samples in output
	 * will always be overwritten!
	 *
	 * @param input		incoming (modulated) samples
	 * @param output	outgoing (demodulated) samples
	 * @param upperBand	if true: USB; if false: LSB
	 */
	demodulateSSB(input, upperBand) {
		// complex band pass:
		let output = Array(input.length)
		if (this.bandPassFilter == null
			|| (upperBand && ((this.bandPassFilter.highCutOffFrequency) != this.userFilterCutOff))
			|| (!upperBand && ((this.bandPassFilter.lowCutOffFrequency) != -this.userFilterCutOff))) {
			// We have to (re-)create the band pass filter:
			this.bandPassFilter = ComplexFirFilter.createBandPass(2,		// Decimate by 2; => AUDIO_RATE
				1,
				input.sample,
				upperBand ? 200 : -this.userFilterCutOff,
				upperBand ? this.userFilterCutOff : -200,
				input.sample * 0.01,
				demodulator.BAND_PASS_ATTENUATION);
			if (this.bandPassFilter == null)
				return;	// This may happen if input samples changed rate or demodulation was turned off. Just skip the filtering.
			console.log("demodulateSSB: created new band pass filter with " + this.bandPassFilter.taps.length
				+ " taps. Decimation=" + this.bandPassFilter.decimation + " Low-Cut-Off=" + this.bandPassFilter.getLowCutOffFrequency()
				+ " High-Cut-Off=" + this.bandPassFilter.highCutOffFrequency + " transition=" + this.bandPassFilter.transitionWidth);
		}
		//	output.setSize(0);	// mark buffer as empty
		if (this.bandPassFilter.filter(input, output, 0, input.length) < input.length) {
			console.log("demodulateSSB: could not filter all samples from input packet.");
		}

		// gain control: searching for max:
		this.lastMax *= 0.95;	// simplest AGC
		for (let i = 0; i < output.length; i++) {
			if (output[i].real > this.lastMax)
				this.lastMax = output[i].real;
		}
		// normalize values:
		let gain = 0.75 / this.lastMax;
		for (let i = 0; i < output.length; i++)
			output[i].real *= gain;

		return output
	}
}
