

class Waterfall {
	static COLORMAP_JET = 1;		// BLUE(0,0,1) - LIGHT_BLUE(0,1,1) - GREEN(0,1,0) - YELLOW(1,1,0) - RED(1,0,0)
	static COLORMAP_HOT = 2;		// BLACK (0,0,0) - RED (1,0,0) - YELLOW (1,1,0) - WHITE (1,1,1)
	static COLORMAP_OLD = 3;
	static COLORMAP_GQRX = 4;
	constructor(canvas, canvasfft, bandSize, historySize, fftsize) {

		this.canvasFft = canvasfft
		this.bandSize = bandSize;
		this.canvas = canvas;
		this.canvas.width = this.bandSize;
		this.canvas.height = historySize;
		this.ctx = this.canvas.getContext('2d');
		this.ctxFft = this.canvasFft.getContext('2d')
		this.fftsize = fftsize
		this.waterfallColorMapType = Waterfall.COLORMAP_JET;
		this.minDB = -115
		this.maxDB = 0
		this.dbDiff = this.maxDB - this.minDB;
		this.createWaterfallColorMap()
		this.scale = this.waterfallColorMap.length / this.dbDiff;	// scale for the color mapping of the waterfall
		this.bars = false
	}
	setColormap(type) {
		this.waterfallColorMapType = type
		this.createWaterfallColorMap()
		this.scale = this.waterfallColorMap.length / this.dbDiff;	// scale for the color mapping of the waterfall
	}

	renderFFT(array) {
		let dbWidth = this.canvasFft.height / this.dbDiff; // Size (in pixel) per 1dB in the fft
		this.ctxFft.fillStyle = "rgba(0, 0, 0, 0.1)";
		this.ctxFft.fillRect(0, 0, this.canvasFft.width, this.canvasFft.height);
		this.ctxFft.beginPath();
		this.ctxFft.moveTo(0, 0);
		for (let i = 0; i < array.length; i += 1) {
			if (this.bars) {
				this.ctxFft.lineTo(i, this.canvasFft.height - (array[i] - this.minDB) * dbWidth);
				this.ctxFft.lineTo(i, this.canvasFft.height);
			} else this.ctxFft.lineTo(i, this.canvasFft.height - (array[i] - this.minDB) * dbWidth);
		}
		this.ctxFft.strokeStyle = "#00b8ff";
		this.ctxFft.stroke();
	}

	renderLine(array) {
		const { canvas, ctx } = this;

		// shift data to up
		ctx.drawImage(
			canvas,
			0, 1, canvas.width, canvas.height - 1,
			0, 0, canvas.width, canvas.height - 1
		);

		let imageData = ctx.getImageData(0, canvas.height, canvas.width, 1);
		let data = imageData.data; // rgba
		for (let i = 0; i < canvas.width; i++) {
			if (array[i] <= this.minDB) this.setColor(data, this.waterfallColorMap[0], i * 4);
			else if (array[i] >= this.maxDB) this.setColor(data, this.waterfallColorMap[this.waterfallColorMap.length - 1], i * 4);
			else this.setColor(data, this.waterfallColorMap[(Math.floor((array[i] + this.dbDiff) * this.scale))], i * 4);
		}
		ctx.putImageData(imageData, 0, canvas.height - 1);
	}
	setColor(data, rgb, n) {
		data[n + 0] = rgb.r;
		data[n + 1] = rgb.g;
		data[n + 2] = rgb.b;
		data[n + 3] = 255;
	}

	createWaterfallColorMap() {
		switch (this.waterfallColorMapType) {
			case Waterfall.COLORMAP_JET:	// BLUE(0,0,1) - LIGHT_BLUE(0,1,1) - GREEN(0,1,0) - YELLOW(1,1,0) - RED(1,0,0)
				this.waterfallColorMap = Array(1024);
				for (let i = 0; i < 256; i++)
					this.waterfallColorMap[i] = { r: 0, g: i, b: 255, a: 255 }
				for (let i = 256; i < 512; i++)
					this.waterfallColorMap[i] = { r: 0, g: 255, b: 255 - i, a: 255 }
				for (let i = 512; i < 768; i++)
					this.waterfallColorMap[i] = { r: i, g: 255, b: 0, a: 255 }
				for (let i = 768; i < 1024; i++)
					this.waterfallColorMap[i] = { r: 255, g: 255 - i, b: 0, a: 255 }
				break;
			case Waterfall.COLORMAP_HOT:	// BLACK (0,0,0) - RED (1,0,0) - YELLOW (1,1,0) - WHITE (1,1,1)
				this.waterfallColorMap = Array(768);
				for (let i = 0; i < 256; i++)
					this.waterfallColorMap[i] = { r: i, g: 0, b: 0, a: 255 }
				for (let i = 256; i < 512; i++)
					this.waterfallColorMap[i] = { r: 255, g: i, b: 0, a: 255 }
				for (let i = 512; i < 768; i++)
					this.waterfallColorMap[i] = { r: 255, g: 255, b: i, a: 255 }
				break;
			case Waterfall.COLORMAP_OLD:
				this.waterfallColorMap = Array(512);
				for (let i = 0; i < 512; i++) {
					let blue = i <= 255 ? i : 511 - i;
					let red = i <= 255 ? 0 : i - 256;
					this.waterfallColorMap[i] = { r: red, g: 0, b: blue, a: 255 }
				}
				break;
			case Waterfall.COLORMAP_GQRX:
				this.waterfallColorMap = Array(256);
				for (let i = 0; i < 256; i++) {
					if (i < 20) {
						for (let i = 0; i < 20; i++)
							this.waterfallColorMap[i] = { r: 0, g: 0, b: 0, a: 255 }
					} // level 0: black background
					else if ((i >= 20) && (i < 70)) {
						for (let i = 20; i < 70; i++)
							this.waterfallColorMap[i] = { r: 0, g: 0, b: 140 * (i - 20) / 50, a: 255 }
					}  // level 1: black -> blue
					else if ((i >= 70) && (i < 100)) {
						for (let i = 70; i < 100; i++)
							this.waterfallColorMap[i] = { r: 60 * (i - 70) / 30, g: 125 * (i - 70) / 30, b: 115 * (i - 70) / 30 + 140, a: 255 }
					}  // level 2: blue -> light-blue / greenish
					else if ((i >= 100) && (i < 150)) {
						for (let i = 100; i < 150; i++)
							this.waterfallColorMap[i] = { r: 195 * (i - 100) / 50 + 60, g: 130 * (i - 100) / 50 + 125, b: 255 - (255 * (i - 100) / 50), a: 255 }
					}  // level 3: light blue -> yellow
					else if ((i >= 150) && (i < 250)) {
						for (let i = 150; i < 250; i++)
							this.waterfallColorMap[i] = { r: 255, g: 255 - 255 * (i - 150) / 100, b: 0, a: 255 }
					} // level 4: yellow -> red
					else if (i >= 250) {
						for (let i = 250; i < 256; i++)
							this.waterfallColorMap[i] = { r: 0, g: 0, b: 0, a: 255 }
					}  // level 5: red -> white
				}
				break;
		}
	}
}
function freqByChannel(channel_number) {
	let freq_hz;
	if (channel_number == 37) {
		freq_hz = 2402000000;
	} else if (channel_number == 38) {
		freq_hz = 2426000000;
	} else if (channel_number == 39) {
		freq_hz = 2480000000;
	} else if (channel_number >= 0 && channel_number <= 10) {
		freq_hz = 2404000000 + channel_number * 2000000;
	} else if (channel_number >= 11 && channel_number <= 36) {
		freq_hz = 2428000000 + (channel_number - 11) * 2000000;
	} else {
		freq_hz = 0xffffffffffffffff;
	}
	return freq_hz;
}