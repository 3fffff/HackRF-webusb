class Decimator {
	/**
	 * Constructor. Will create a new Decimator block.
	 *
	 * @param outputSampleRate		// sample rate to which the incoming samples should be decimated
	 * @param packetSize			// packet size of the incoming sample packets
	 */
	constructor(sampleRate, outSample) {
		this.sampleRate = sampleRate;
		this.outputSampleRate = outSample;

		// Create half band filters for downsampling:
		this.inputFilter1 = new HalfBandLowPassFilter(8);
		this.inputFilter2 = new HalfBandLowPassFilter(8);
		this.inputFilter3 = new HalfBandLowPassFilter(8);
	}
	setOutputSample(outSamp){
		this.outputSampleRate = outSamp
	}
	/**
	 * Will decimate the input samples to the outputSampleRate and store them in output
	 *
	 * @param input		incoming samples at the incoming rate (input rate)
	 * @param output	outgoing (decimated) samples at output rate (quadrature rate)
	 */
	downsampling(input) {
		let output
		// Verify that the input filter 4 is still correct configured (gain):
		if (this.inputFilter4 == null || this.inputFilter4.gain != 2 * (this.outputSampleRate / this.sampleRate)) {
			// We have to (re-)create the filter:
			this.inputFilter4 = FirFilter.createLowPass(2, 2 * (this.outputSampleRate / this.sampleRate), 1, 0.15, 0.2, 20);
			console.log("downsampling: created new inputFilter4 with " + this.inputFilter4.taps.length
				+ " taps. Decimation=" + this.inputFilter4.decimation + " Cut-Off=" + this.inputFilter4.cutOffFrequency
				+ " transition=" + this.inputFilter4.transitionWidth);
		}

		// apply first filter (decimate to INPUT_RATE/2)
		this.tmpDownsampledSamples = this.inputFilter1.filterN8(input)
		if (input.length / 2 != this.tmpDownsampledSamples.length)
			console.log("downsampling: [inputFilter1] could not filter all samples from input packet.");

		// if we need a decimation of 16: apply second and third filter (decimate to INPUT_RATE/8)
		if (this.sampleRate / this.outputSampleRate == 16) {
			output = this.inputFilter2.filterN8(this.tmpDownsampledSamples)
			if (output.length < this.tmpDownsampledSamples.length)
				console.log("downsampling: [inputFilter2] could not filter all samples from input packet.");

			this.tmpDownsampledSamples = this.inputFilter3.filterN8(output)
			if (this.tmpDownsampledSamples.length < output.length)
				console.log("downsampling: [inputFilter3] could not filter all samples from input packet.");
		}
		output = this.inputFilter4.filter(this.tmpDownsampledSamples)
		if (output.length != this.tmpDownsampledSamples.length)
			console.log("downsampling: [inputFilter4] could not filter all samples from input packet.");
		return output
	}
}
