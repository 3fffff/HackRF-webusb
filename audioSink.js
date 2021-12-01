class audioSink {
	AudioSink(packetSize, sampleRate) {
		this.packetSize = packetSize;
		this.sampleRate = sampleRate;

		// Create the audio filters:
		this.audioFilter1 = FirFilter.createLowPass(2, 1, 1, 0.1, 0.15, 30);
		console.log("constructor: created audio filter 1 with " + this.audioFilter1.getNumberOfTaps() + " Taps.");
		this.audioFilter2 = FirFilter.createLowPass(4, 1, 1, 0.1, 0.1, 30);
		console.log("constructor: created audio filter 2 with " + this.audioFilter2.getNumberOfTaps() + " Taps.");
		this.tmpAudioSamples = Array(packetSize);
	}

	/**
	 * Will filter the real array contained in input and decimate them to the audio rate.
	 */
	applyAudioFilter(input) {
		// if we need a decimation of 8: apply first and second filter (decimate to input_rate/8)
		if (input.length / this.sampleRate == 8) {
			// apply first filter (decimate to input_rate/2)
			this.tmpAudioSamples = this.audioFilter1.filterReal(input)
			input = this.audioFilter2.filterReal(this.tmpAudioSamples)
		} else if (input.length / sampleRate == 2) {
			// apply first filter (decimate to input_rate/2 )
			this.tmpAudioSamples = audioFilter1.filterReal(input)
			input = this.tmpAudioSamples
		} else console.log("applyAudioFilter: incoming sample rate is not supported!");
		for (let i = 0; i < input.length; i++)
			input[i].real *= 32767;
	}
}
