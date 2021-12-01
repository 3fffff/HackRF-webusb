class IQConverter {
  lookupTable;				// Lookup table to transform IQ bytes into doubles
  cosineRealLookupTable;	// Lookup table to transform IQ bytes into frequency shifted doubles
  cosineImagLookupTable;	// Lookup table to transform IQ bytes into frequency shifted doubles
  cosineFrequency;	    // Frequency of the cosine that is mixed to the signal
  frequency;
  static MAX_COSINE_LENGTH = 500;	// Max length of the cosine lookup table

  constructor(frequency, sampleRate) {
    this.frequency = frequency
    this.sampleRate = sampleRate
    this.lookupTable = Array(256);
    for (let i = 0; i < 256; i++) { this.lookupTable[i] = (i - 128.0) / 128.0; }
  }

  calcOptimalCosineLength() {
    // look for the best fitting array size to hold one or more full cosine cycles:
    let cycleLength = this.sampleRate / Math.abs(this.cosineFrequency);
    let bestLength = Math.floor(cycleLength);
    let bestLengthError = Math.abs(bestLength - cycleLength);
    for (let i = 1; i * cycleLength < IQConverter.MAX_COSINE_LENGTH; i++) {
      if (Math.abs(i * cycleLength - (i * cycleLength)) < bestLengthError) {
        bestLength = (i * cycleLength);
        bestLengthError = Math.abs(bestLength - (i * cycleLength));
      }
    }
    return Math.ceil(bestLength);
  }

  /**
   * 
   * @param {number} mixFrequency
   */
  generateMixerLookupTable(mixFrequency) {
    if (mixFrequency === 0 || ((this.sampleRate / Math.abs(mixFrequency)) > IQConverter.MAX_COSINE_LENGTH)) mixFrequency += this.sampleRate;
    if (this.cosineRealLookupTable == null || mixFrequency !== this.cosineFrequency) {
      this.cosineFrequency = mixFrequency;
      let bestLength = this.calcOptimalCosineLength();
      this.cosineRealLookupTable = (function (dims) { let allocate = function (dims) { if (dims.length == 0) { return 0; } else { let array = []; for (let i = 0; i < dims[0]; i++) { array.push(allocate(dims.slice(1))); } return array; } }; return allocate(dims); })([bestLength, 256]);
      this.cosineImagLookupTable = (function (dims) { let allocate = function (dims) { if (dims.length == 0) { return 0; } else { let array = []; for (let i = 0; i < dims[0]; i++) { array.push(allocate(dims.slice(1))); } return array; } }; return allocate(dims); })([bestLength, 256]);
      for (let t = 0; t < bestLength; t++) {
        let cosineAtT = Math.cos(2 * Math.PI * this.cosineFrequency * t / this.sampleRate);
        let sineAtT = Math.sin(2 * Math.PI * this.cosineFrequency * t / this.sampleRate);
        for (let i = 0; i < 256; i++) {
          this.cosineRealLookupTable[t][i] = (i - 128) / 128 * cosineAtT;
          this.cosineImagLookupTable[t][i] = (i - 128) / 128 * sineAtT;
        }
      }
    }
  }

  /**
   * 
   * @param {Array} packet
   */
  fillPacketIntoSamplePacket(packet) {
    let data = Array(packet.length / 2)
    for (let i = 0; i < packet.length; i += 2)
      data[i / 2] = new complex(this.lookupTable[packet[i] + 128], this.lookupTable[packet[i + 1] + 128]);
    return data;
  }
  fillPacketIntoSamplePacketc(packet) {
    let data = Array(packet.length)
    for (let i = 0; i < packet.length; i++) {
      if (i % 2 == 0)
        data[i] = this.lookupTable[packet[i] + 128];
      else data[i] = 0;
    }
    return data;
  }
  /**
   * 
   * @param {Array} packet
   * @param {number} channelFrequency
   */
  mixPacketIntoSamplePacket(packet, channelFrequency) {
    const mixFrequency = ((this.frequency - channelFrequency) | 0);
    let cosineIndex = 0;							// current index within the cosine
    this.generateMixerLookupTable(mixFrequency);
    let data = Array(packet.length / 2);
    for (let i = 0; i < packet.length; i += 2) {
      data[i / 2] = new complex(this.cosineRealLookupTable[cosineIndex][packet[i] + 128] - this.cosineImagLookupTable[cosineIndex][packet[i + 1] + 128],
        this.cosineRealLookupTable[cosineIndex][packet[i + 1] + 128] + this.cosineImagLookupTable[cosineIndex][packet[i] + 128]);
      cosineIndex = (cosineIndex + 1) % this.cosineRealLookupTable.length;
    }
    return data;
  }
}