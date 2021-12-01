importScripts("comlink.js");
importScripts("hackrf.js");
importScripts("complex.js");
importScripts("fft.js");
importScripts("FirFilter.js");
importScripts("HalfBandLowPassFilter.js");
importScripts("complexFirFilter.js");
importScripts("decimator.js");
importScripts("audioSink.js");
importScripts("demodulator.js");
importScripts("signed.js");

class Worker {

	async open(opts) {

		const devices = await navigator.usb.getDevices();
		const device = !opts ? devices[0] : devices.find(d => {
			if (opts.vendorId) {
				if (d.vendorId !== opts.vendorId) {
					return false;
				}
			}
			if (opts.productId) {
				if (d.productId !== opts.productId) {
					return false;
				}
			}
			if (opts.serialNumber) {
				if (d.serialNumber !== opts.serialNumber) {
					return false;
				}
			}
			return true;
		});
		if (!device) return false;

		console.log(device);
		
		this.channelFreq = 0
		this.hackrf = new HackRF();
		await this.hackrf.open(device);
		return true;
	}

	async info() {
		const { hackrf } = this;
		const boardId = await hackrf.readBoardId();
		const versionString = await hackrf.readVersionString();
		const apiVersion = await hackrf.readApiVersion();
		const { partId, serialNo } = await hackrf.readPartIdSerialNo();

		console.log(`Serial Number: ${serialNo.map((i) => (i + 0x100000000).toString(16).slice(1)).join('')}`)
		console.log(`Board ID Number: ${boardId} (${HackRF.BOARD_ID_NAME[boardId]})`);
		console.log(`Firmware Version: ${versionString} (API:${apiVersion[0]}.${apiVersion[1]}${apiVersion[2]})`);
		console.log(`Part ID Number: ${partId.map((i) => (i + 0x100000000).toString(16).slice(1)).join(' ')}`)
		return { boardId, versionString, apiVersion, partId, serialNo };
	}

	async start(opts, callback) {
		const { hackrf } = this;

		const { FFT_SIZE, SAMPLE_RATE, lowFreq, highFreq, bandwidth, freqBinCount, windows } = opts;
		console.log({ lowFreq, highFreq, bandwidth, freqBinCount });

		await hackrf.setSampleRateManual(SAMPLE_RATE, 1);
		await hackrf.setBasebandFilterBandwidth(15e6);
		this.SAMPLE_RATE = SAMPLE_RATE
		this.bandwidth = bandwidth

		this.window = Fourier.MakeWindow(windows, FFT_SIZE);
		this.FFT_SIZE = FFT_SIZE
		const SAMPLES_PER_BLOCK = HackRF.SAMPLES_PER_BLOCK;
		this.demodulator = new demodulator(this.FFT_SIZE, this.SAMPLE_RATE)
		const BYTES_PER_BLOCK = HackRF.BYTES_PER_BLOCK;
		const TRANSFER_BUFFER_SIZE = HackRF.TRANSFER_BUFFER_SIZE;
		const len = TRANSFER_BUFFER_SIZE / BYTES_PER_BLOCK
		console.log(len)
		this.IQConvert = new IQConverter((lowFreq + highFreq) / 2, this.FFT_SIZE)
		let startTime = performance.now();
		let bytesPerSec = 0;
		let sweepCount = 0;
		let sweepPerSec = 0;
		this.freqBinCount = freqBinCount
		let line = new Float32Array(this.freqBinCount);
		let output = new Float32Array(this.FFT_SIZE);
		await hackrf.startRx((data) => {
			const now = performance.now();
			for (let n = 0, o = 0; n < len; n++) {
				// console.log(o % HackRF.BYTES_PER_BLOCK, n, data[o+0], data[o+1]);
				if (!(data[o + 0] === 0x7F && data[o + 1] === 0x7F)) {
					//console.log('invalid header', n, data[o + 0], data[o + 1]);
					o += BYTES_PER_BLOCK;
					continue;
				}

				// this is sweep mode
				// JavaScript does not support 64bit, and all bit operations treat number as 32bit.
				// but double can retain 53bit integer (Number.MAX_SAFE_INTEGER) and frequency never exceeds Number.MAX_SAFE_INTEGER
				// so we can calculate with generic floating point math operation.
				const freqH = (
					(data[o + 9] << 24) |
					(data[o + 8] << 16) |
					(data[o + 7] << 8) |
					(data[o + 6] << 0)) >>> 0;
				const freqL = (
					(data[o + 5] << 24) |
					(data[o + 4] << 16) |
					(data[o + 3] << 8) |
					(data[o + 2] << 0)) >>> 0;
				const frequency = 2 ** 32 * freqH + freqL;

				const freqM = frequency / 1e6;

				if (freqM < lowFreq) {
					console.log(freqM, 'ignored', lowFreq);
					o += BYTES_PER_BLOCK;
					continue;
				} else if (freqM > highFreq) {
					console.log(freqM, 'ignored', highFreq);
					o += BYTES_PER_BLOCK;
					continue
				} else if (freqM === lowFreq) {
					sweepCount++;

					const duration = now - startTime;
					sweepPerSec = sweepCount / (duration / 1000);
					const MAX_FPS = 60;
					if (sweepPerSec < MAX_FPS || sweepCount % Math.round(sweepPerSec / MAX_FPS) === 0) {
						callback(line, { sweepPerSec, bytesPerSec, sweepCount });
					}
					line.fill(0);
				}
				o += BYTES_PER_BLOCK - (this.FFT_SIZE * 2);
				let target = data.subarray(o, o + this.FFT_SIZE * 2)
				let res = this.IQConvert.fillPacketIntoSamplePacket(target)
				//let resc = this.IQConvert.fillPacketIntoSamplePacketc(target)
				Fourier.ApplyFFTWindow(res, this.window);
				//Fourier.ApplyFFTWindowc(resc, this.window);
				//Fourier.fftc(resc, target.length)
				Fourier.fft(res);
				Fourier.SpectrumPower(res, output, this.FFT_SIZE, 0);
				//Fourier.SpectrumPowerc(resc, output, this.FFT_SIZE, 0);
				//console.log(res)
				//console.log(resc)
				o += this.FFT_SIZE * 2;
				//console.log(target)
				//line.set(output)
				const pos = Math.floor((freqM - lowFreq) / bandwidth * freqBinCount);
				const low = output.subarray(Math.floor(FFT_SIZE / 8 * 1), Math.ceil(FFT_SIZE / 8 * 3) + 1);
				if (pos < line.length) line.set(low.subarray(0, (line.length - pos)), pos);
				const pos2 = pos + FFT_SIZE / 2;
				const high = output.subarray(Math.floor(FFT_SIZE / 8 * 5), Math.ceil(FFT_SIZE / 8 * 7) + 1);
				if (pos2 < line.length) line.set(high.subarray(0, (line.length - pos2)), pos2);
				if ( this.channelFreq != 0){
					this.demodulator.run(this.IQConvert.mixPacketIntoSamplePacket(target, this.channelFreq),this.bandwidth)
				}
			}
		});

		await hackrf.initSweep(
			[lowFreq, highFreq],
			SAMPLES_PER_BLOCK * 2 /* I + Q */,
			SAMPLE_RATE,
			SAMPLE_RATE / 8 * 3,
			HackRF.SWEEP_STYLE_INTERLEAVED
		);
	}

	async setSampleRateManual(freq, divider) {
		await this.hackrf.setSampleRateManual(freq, devider);
	}

	async setBasebandFilterBandwidth(bandwidthHz) {
		await this.hackrf.setBasebandFilterBandwidth(bandwidthHz);
	}

	async setLnaGain(value) {
		await this.hackrf.setLnaGain(value);
	}

	async setVgaGain(value) {
		await this.hackrf.setVgaGain(value);
	}

	async setFreq(freqHz) {
		await this.hackrf.setFreq(freqHz);
	}

	async setAmpEnable(enable) {
		await this.hackrf.setAmpEnable(enable);
	}

	async setAntennaEnable(enable) {
		await this.hackrf.setAntennaEnable(enable);
	}

	async initSweep(ranges, numBytes, stepWidth, offset, style) {
		await this.hackrf.initSweep(ranges, numBytes, stepWidth, offset, style);
	}

	async startRx(callback) {
		await this.hackrf.startRx(callback);
	}

	async stopRx() {
		await this.hackrf.stopRx();
	}

	async close() {
		await this.hackrf.close();
		await this.hackrf.exit();
	}
	async reset() {
		await this.hackrf.reset()
	}
	async setDemodulationMode(mode) {
		this.demodulator.setDemodulationMode(mode)

	}
	async setChannelFrequency(channelFreq){
		this.channelFreq = channelFreq
		console.log(this.channelFreq)
	}
}

Comlink.expose(Worker);
