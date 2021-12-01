class Fourier {
  static SpectrumPower(buffer, power, fftSize) {
    for (let i = 0; i < buffer.length; ++i)
      power[i] = 10.0 * Math.log10((buffer[i].real * buffer[i].real + buffer[i].imag * buffer[i].imag) / fftSize);
  }
  static SpectrumPowerc(buffer, power, fftSize) {
    for (let i = 0; i < buffer.length; i += 2)
      power[i / 2] = 10.0 * Math.log10((buffer[i] * buffer[i] + buffer[i + 1] * buffer[i + 1]) / fftSize);
  }

  static ApplyFFTWindow(buffer, window) {
    for (let i = 0; i < window.length; ++i) {
      buffer[i].real *= window[i];
      buffer[i].imag *= window[i];
    }
  }
  static ApplyFFTWindowc(buffer, window) {
    for (let i = 0; i < buffer.length; ++i) {
      buffer[i] *= window[Math.floor(i / 2)];
    }
  }
  static Inverse(samples, length) {
    for (let i = 0; i < length; ++i)
      samples[i].imag = -samples[i].imag;
    Fourier.fft(samples, length, false);
    let num = 1 / length;
    for (let i = 0; i < length; ++i) {
      samples[i].real *= num;
      samples[i].imag = -samples[i].imag * num;
    }
  }
  static fft(buffer) {
    const pow = Math.log2(buffer.length);
    let index1 = buffer.length / 2;
    for (let index2 = 1; index2 < buffer.length; ++index2) {
      if (index2 < index1) {
        let complex = buffer[index1];
        buffer[index1] = buffer[index2];
        buffer[index2] = complex;
      }
      let num4;
      for (num4 = buffer.length / 2; num4 <= index1; num4 /= 2)
        index1 -= num4;
      index1 += num4;
    }
    for (let index2 = 1; index2 <= pow; ++index2) {
      const num4 = Math.floor(1 << index2);
      const num5 = Math.floor(num4 / 2);
      const num6 = buffer.length - 1 < 65536 ? 16 - index2 : Math.PI / num5;
      for (let index3 = 1; index3 <= num5; ++index3) {
        let num7 = index3 - 1;
        let complex1 = buffer.length - 1 < 65536 ? Fourier._lut[num7 << num6] : complex.FromAngle(num6 * num7).Conjugate();
        for (let index4 = num7; index4 <= buffer.length - 1; index4 += num4) {
          let index5 = index4 + num5;
          let complex2 = complex1.mul(buffer[index5]);
          buffer[index5] = buffer[index4].sub(complex2);
          buffer[index4] = buffer[index4].add(complex2);
        }
      }
    }
    for (let i = 0; i < buffer.length / 2; ++i) {
      let index2 = buffer.length / 2 + i;
      let complex = buffer[i];
      buffer[i] = buffer[index2];
      buffer[index2] = complex;
    }
  }
  static fftc(buffer, length) {
    const pow = Math.log2(length / 2);
    let index1 = Math.ceil(length / 2);
    for (let index2 = 2; index2 < length; index2 += 2) {
      if (index2 < index1) {
        const complexR = buffer[index1];
        const complexI = buffer[index1 + 1];
        buffer[index1] = buffer[index2];
        buffer[index1 + 1] = buffer[index2 + 1];
        buffer[index2] = complexR;
        buffer[index2 + 1] = complexI;
      }
      let num4;
      for (num4 = length / 2; num4 <= index1; num4 /= 2)
        index1 -= num4;
      index1 += num4;
    }
    for (let index2 = 1; index2 <= pow; ++index2) {
      const num4 = Math.floor(1 << index2);
      const num5 = Math.floor(num4 / 2);
      const num6 = 16 - index2;
      for (let index3 = 1; index3 <= num5; index3++) {
        let num7 = index3 - 1;
        let complex1 = Fourier._lut[num7 << num6];
        for (let index4 = 2 * num7; index4 < length; index4 += 2 * num4) {
          const index5 = index4 + 2 * num5;
          const complex2R = complex1.real * buffer[index5] - complex1.imag * buffer[index5 + 1];
          const complex2I = complex1.imag * buffer[index5] + complex1.real * buffer[index5 + 1];
          buffer[index5] = buffer[index4] - complex2R;
          buffer[index5 + 1] = buffer[index4 + 1] - complex2I;
          buffer[index4] = buffer[index4] + complex2R;
          buffer[index4 + 1] = buffer[index4 + 1] + complex2I;
        }
      }
    }
    for (let i = 0; i < length / 2; i+=2) {
      const index2 = (length / 2 + i);
      const complexR = buffer[i];
      const complexI = buffer[i + 1];
      buffer[i] = buffer[index2];
      buffer[i + 1] = buffer[index2 + 1];
      buffer[index2] = complexR;
      buffer[index2 + 1] = complexI;
    }
  }
  static MakeWindow(windowType, length) {
    const arrWd = ['Hamming', 'Blackman', 'BlackmanHarris4', 'BlackmanHarris7', 'HannPoisson', 'Youssef']
    let numArray = Array(length);
    for (let i = 0; i < length; ++i) {
      numArray[i] = 1;
      switch (arrWd[windowType]) {
        case 'Hamming':
          numArray[i] *= (0.54 - 0.46 * Math.cos(2.0 * Math.PI * i / length));
          break;
        case 'Blackman':
          numArray[i] *= (0.42 - 0.5 * Math.cos(2.0 * Math.PI * i / length) + 0.08 * Math.cos(4.0 * Math.PI * i / length));
          break;
        case 'BlackmanHarris4':
          numArray[i] *= (0.35875 - 0.48829 * Math.cos(2.0 * Math.PI * i / length) + 0.14128 * Math.cos(4.0 * Math.PI * i / length) - 0.01168 * Math.cos(6.0 * Math.PI * i / length));
          break;
        case 'BlackmanHarris7':
          numArray[i] *= (0.2710514 - 0.4332979 * Math.cos(2.0 * Math.PI * i / length) + 0.218123 * Math.cos(4.0 * Math.PI * i / length) - 0.06592545 * Math.cos(6.0 * Math.PI * i / length) + 0.01081174 * Math.cos(8.0 * Math.PI * i / length) - 0.0007765848 * Math.cos(10.0 * Math.PI * i / length) + 1.388722E-05 * Math.cos(12.0 * Math.PI * i / length));
          break;
        case 'HannPoisson':
          numArray[i] *= 0.5 * ((1.0 + Math.cos(2.0 * Math.PI * (i - length / 2) / length)) * Math.exp(-2.0 * 0.005 * Math.abs(i - length / 2) / length));
          break;
        case 'Youssef':
          numArray[i] *= (0.35875 - 0.48829 * Math.cos(2.0 * Math.PI * i / length) + 0.14128 * Math.cos(4.0 * Math.PI * i / length) - 0.01168 * Math.cos(6.0 * Math.PI * i / length));
          numArray[i] *= Math.exp(-2.0 * 0.005 * Math.abs(i - length / 2) / length);
          break;
      }
    }
    return numArray;
  }
}
Fourier._lut = (s => { let a = []; while (s++ < 32768) a.push(complex.FromAngle(9.58737992428526E-05 * s).Conjugate()); return a; })(0);