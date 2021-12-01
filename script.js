const Backend = Comlink.wrap(new Worker("worker.js"));
var backend = null;
var connected = false
var running = false
var FFT_SIZE = 512
const SAMPLE_RATE = 20e6;
let tfreqBinCount = FFT_SIZE;
var range = { start: 2400, stop: 2500, fftsize: FFT_SIZE }
var options = { ampEnabled: false, antennaEnabled: false, lnaGain: 0, vgaGain: 0, windows: 1 }
var info = {}
var waterfall
const canvasFft = document.getElementById('fft')
const canvasWf = document.getElementById('waterfall')
const ctxFft = canvasFft.getContext('2d');
const metric = document.getElementById("metric")
const hover = document.getElementById("hover")
/*const audioCtx = new (window.AudioContext || window.webkitAudioContext)();*/
async function connect() {

	if (!await backend.open()) {
		const device = await HackRF.requestDevice();
		if (!device) {
			console.log("device is not found");
			return;
		}
		console.log("opening device");
		const ok = await backend.open({
			vendorId: device.vendorId,
			productId: device.productId,
			serialNumber: device.serialNumber
		});
		if (!ok) {
			this.alert.content = "failed to open device";
			this.alert.show = true;
		}
	}
	const { boardId, versionString, apiVersion, partId, serialNo } = await backend.info();
	info['serialNumber'] = serialNo.map((i) => (i + 0x100000000).toString(16).slice(1)).join('');
	info['boardId'] = boardId;
	info['boardName'] = HackRF.BOARD_ID_NAME[boardId];
	info['firmwareVersion'] = `${versionString} (API:${apiVersion[0]}.${apiVersion[1]}${apiVersion[2]})`;
	info['partIdNumber'] = partId.map((i) => (i + 0x100000000).toString(16).slice(1)).join(' ');
	console.log(`connected to ${HackRF.BOARD_ID_NAME[info.boardId]}`);
}

async function disconnect() {
	await backend.close();
	console.log('disconnected');
	//this.connected = false;
	running = false;
}
async function start() {
	document.getElementById("axises").innerHTML = genAxises()
	console.log('apply options', options);

	await backend.setAmpEnable(options.ampEnabled);
	await backend.setAntennaEnable(options.antennaEnabled);
	await backend.setLnaGain(options.lnaGain);
	await backend.setVgaGain(options.vgaGain);
	if (range.stop - range.start < 0)
		range.stop = range.start + 20
	const lowFreq = range.start;
	const highFreq0 = range.stop;
	const bandwidth0 = highFreq0 - lowFreq;
	const steps = Math.ceil((bandwidth0 * 1e6) / SAMPLE_RATE);
	const bandwidth = (steps * SAMPLE_RATE) / 1e6;
	const highFreq = lowFreq + bandwidth;
	const windows = options.windows
	range.stop = highFreq;

	const freqBinCount = (bandwidth * 1e6) / SAMPLE_RATE * FFT_SIZE;

	canvasFft.height = 200;
	canvasFft.width = freqBinCount;
	console.log({ lowFreq, highFreq, bandwidth, freqBinCount });
	waterfall = new Waterfall(canvasWf, canvasFft, freqBinCount, 256, FFT_SIZE, FFT_SIZE / 5);

	await backend.start({ FFT_SIZE, SAMPLE_RATE, lowFreq, highFreq, bandwidth, freqBinCount, windows }, Comlink.proxy((data, metrics) => {
		requestAnimationFrame(() => {
			metric.innerHTML = Math.floor(metrics.sweepPerSec) + " sweep/sec " + Math.floor(metrics.bytesPerSec) + " MB/sec"
			waterfall.renderLine(data);
			waterfall.renderFFT(data)
		});

		//console.log(audioCtx)
	}));
}

async function stop() {
	backend.stopRx();
	running = false;
}

const hoverListenr = (e) => {
	const rect = e.currentTarget.getBoundingClientRect();
	const x = e.clientX - rect.x;
	const p = x / rect.width;
	hover.innerHTML = (range.start + (p * (range.stop - range.start))).toFixed(2)
	hover.style.left = (p * 100) + "%";
	if (p > 0.95)
		hover.classList.add("right")
	else
		hover.classList.remove("right")
};
const leaveListener = (e) => {
	hover.style.left = "-100%";
};

(async function () {
	canvasWf.addEventListener('mousemove', hoverListenr);
	canvasWf.addEventListener('mouseleave', leaveListener);
	document.getElementById("axises").innerHTML = genAxises()
	document.getElementById("axisesy").innerHTML = getYaxis()
	backend = await new Backend()
})()
function genAxises() {
	let step = 4
	let delta = (range.stop - range.start)
	let sdt = 100 / step
	let res = ''
	for (let i = 0; i < step; i++) {
		let rn = range.start + (delta / step) * i
		let it = i * sdt
		res += '<div class="axis" style="left: ' + it + '%;">' + rn.toFixed(1) + '</div>'
	}
	res += '<div class="axis right" style="right: 0%">' + range.stop.toFixed(1) + '</div>'
	return res
}

//canvasFft.addEventListener('mousemove', hoverListenr);
//canvasFft.addEventListener('mouseleave', leaveListener);

document.getElementById('connect').addEventListener('click', function () {
	if (!connected) {
		this.innerHTML = 'disconnect'
		connected = true
		connect()
	} else if (connected && running) {
		this.innerHTML = 'connect'
		connected = false
		running = false
		document.getElementById('start').innerHTML = 'start'
		stop()
		disconnect()
	}
	else {
		this.innerHTML = 'connect'
		connected = false
		disconnect()
	}
})
document.getElementById('start').addEventListener('click', function () {
	if (!connected && !running)
		return
	if (!running) {
		this.innerHTML = 'stop'
		running = true
		start()
	}
	else {
		this.innerHTML = 'start'
		running = false
		stop()
	}
})
document.getElementById('amp').addEventListener('click', function () {
	if (this.checked) {
		options.ampEnabled = true
		backend.setAmpEnable(true)
	}
	else {
		options.ampEnabled = false
		backend.setAmpEnable(false)
	}
})
document.getElementById('app').addEventListener('click', function () {
	console.log(this)
	if (this.checked) {
		options.antennaEnabled = true
		backend.setAntennaEnable(true)
	}
	else {
		options.antennaEnabled = false
		backend.setAntennaEnable(false)
	}
})
document.getElementById('lna').addEventListener('change', function () {
	options.lnaGain = parseInt(this.value)
	if (connected)
		backend.setLnaGain(options.lnaGain)
})
document.getElementById('vga').addEventListener('change', function () {
	options.vgaGain = parseInt(this.value)
	if (connected)
		backend.setVgaGain(options.vgaGain)
})
document.getElementById('windows').addEventListener('change', function () {
	range.windows = parseInt(this.value)
	backend.window = Fourier.MakeWindow(range.windows, FFT_SIZE);
})
document.getElementById('fftsize').addEventListener('change', function () {
	FFT_SIZE = parseInt(this.value)
	range.fftsize = FFT_SIZE
	backend.setFFTSIZE(FFT_SIZE)
	let freqBinCount = (20 * 1e6) / SAMPLE_RATE * FFT_SIZE
	canvasFft.width = freqBinCount
	backend.FFT_SIZE = FFT_SIZE
	console.log(freqBinCount)
	document.getElementById('colorRange').setAttribute('min', FFT_SIZE / 8)
	document.getElementById('colorRange').setAttribute('max', FFT_SIZE)
	waterfall = new Waterfall(canvasWf, freqBinCount, 256, FFT_SIZE.FFT_SIZE / 5);
})

document.getElementById('demodulation').addEventListener('change', function () {
	backend.setDemodulationMode(parseInt(this.value))
})

document.getElementById('colormap').addEventListener('click', function () {
	waterfall.setColormap(parseInt(this.value))
})
document.getElementById('bars').addEventListener('click', function () {
	if (this.checked) waterfall.bars = true
	else waterfall.bars = false
})
document.getElementById('stf').addEventListener('click', function () {
	range.start = parseInt(this.value)
})
document.getElementById('stf').addEventListener('change', function () {
	range.start = parseInt(this.value)
})
document.getElementById('edf').addEventListener('click', function () {
	range.stop = parseInt(this.value)
})
document.getElementById('edf').addEventListener('change', function () {
	range.stop = parseInt(this.value)
})
document.getElementById('waterfall').addEventListener('click', function () {
	const left = document.getElementById('hover').style.left
	const delta = range.stop - range.start
	backend.setChannelFrequency(range.start + delta * parseFloat(left) / 100)
	//backend.channelFreq = range.start + delta * parseFloat(left) / 100
})
function getYaxis() {
	let res = ""
	for (let i = 0; i < 11; i++)
		res += '<div class="axisy" style="top:' + i * (100 / 12) + '%">' + i * (-10) + '</div>'
	return res
}
