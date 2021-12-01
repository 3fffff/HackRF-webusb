class HalfBandLowPassFilter {
    constructor(N) {
        if (this.taps === undefined) this.taps = null;
        if (this.delaysReal === undefined) this.delaysReal = null;
        if (this.delaysImag === undefined) this.delaysImag = null;
        if (this.delaysMiddleTapReal === undefined) this.delaysMiddleTapReal = null;
        if (this.delaysMiddleTapImag === undefined) this.delaysMiddleTapImag = null;
        if (this.delayIndex === undefined) this.delayIndex = 0;
        if (this.delayMiddleTapIndex === undefined) this.delayMiddleTapIndex = 0;
        if (N % 4 !== 0) new Error("N must be multiple of 4");
        this.delaysReal = (s => { let a = []; while (s-- > 0) a.push(0); return a; })((N / 2 | 0));
        this.delaysImag = (s => { let a = []; while (s-- > 0) a.push(0); return a; })((N / 2 | 0));
        this.delaysMiddleTapReal = (s => { let a = []; while (s-- > 0) a.push(0); return a; })((N / 4 | 0));
        this.delaysMiddleTapImag = (s => { let a = []; while (s-- > 0) a.push(0); return a; })((N / 4 | 0));
        this.delayIndex = 0;
        this.delayMiddleTapIndex = 0;
        switch (N) {
            case 8:
                this.taps = [-0.045567308, 0.5508474];
                break;
            case 12:
                this.taps = [0.018032677, -0.11459156, 0.59738594];
                break;
            case 32:
                this.taps = [-0.020465752, 0.021334704, -0.03264687, 0.04875241, -0.072961785, 0.113978915, -0.203983, 0.63384163];
                break;
            default:
                new Error("N=" + N + " is not supported!")
        }
    }

    /**
     * Filters the samples from the input sample packet and appends filter output to the output
     * sample packet. Stops automatically if output sample packet is full.
     * 
     * This method uses a half band low pass filter with N taps. It will decimate by 2 and
     * amplify the signal by 2.
     */
    filter(input) {
        let output = Array(input.length / 2)
        let outInd = 0
        for (let i = 0; i < input.length; i += 2) {
            output[outInd] = new complex()
            this.delaysReal[this.delayIndex] = input[i].real;
            this.delaysImag[this.delayIndex] = input[i].imag;
            this.delaysMiddleTapReal[this.delayMiddleTapIndex] = input[i + 1].real;
            this.delaysMiddleTapImag[this.delayMiddleTapIndex] = input[i + 1].imag;
            this.delayMiddleTapIndex++;
            if (this.delayMiddleTapIndex >= this.delaysMiddleTapReal.length) this.delayMiddleTapIndex = 0;
            let index1 = this.delayIndex;
            let index2 = this.delayIndex + this.delaysReal.length - 1;
            for (let index13151 = 0; index13151 < this.taps.length; index13151++) {
                let tap = this.taps[index13151];
                output[outInd].real += (this.delaysReal[index1] + this.delaysReal[index2]) * tap;
                output[outInd].imag += (this.delaysImag[index1] + this.delaysImag[index2]) * tap;
                index1++;
                index2--;
                if (index1 > this.delaysReal.length) index1 = 0;
                if (index2 < 0) index2 = this.delaysReal.length - 1;
            }
            output[outInd].real += this.delaysMiddleTapReal[this.delayMiddleTapIndex];
            output[outInd].imag += this.delaysMiddleTapImag[this.delayMiddleTapIndex];
            outInd++
        }
        return output;
    }

    /**
     * Filters the samples from the input sample packet and appends filter output to the output
     * sample packet. Stops automatically if output sample packet is full.
     * 
     * This method uses a half band low pass filter with 8 taps. It will decimate by 2 and
     * amplify the signal by 2. First 30% of the output signal frequency spectrum are protected
     * from aliasing (-30dB)
     */
    filterN8(input) {
        let output = (s => { let a = []; while (s-- > 0) a.push(new complex()); return a; })(input.length / 2);
        for (let i = 0; i < input.length; i += 2) {
            this.delaysReal[this.delayIndex] = input[i].real;
            this.delaysImag[this.delayIndex] = input[i].imag;
            this.delaysMiddleTapReal[this.delayMiddleTapIndex] = input[i + 1].real;
            this.delaysMiddleTapImag[this.delayMiddleTapIndex] = input[i + 1].imag;
            this.delayMiddleTapIndex++;
            if (this.delayMiddleTapIndex >= 2) this.delayMiddleTapIndex = 0;
            switch ((this.delayIndex)) {
                case 0:
                    output[i / 2].real = (this.delaysReal[0] + this.delaysReal[3]) * -0.045567308 + (this.delaysReal[1] + this.delaysReal[2]) * 0.5508474 + this.delaysMiddleTapReal[this.delayMiddleTapIndex];
                    output[i / 2].imag = (this.delaysImag[0] + this.delaysImag[3]) * -0.045567308 + (this.delaysImag[1] + this.delaysImag[2]) * 0.5508474 + this.delaysMiddleTapImag[this.delayMiddleTapIndex];
                    this.delayIndex = 1;
                    break;
                case 1:
                    output[i / 2].real = (this.delaysReal[1] + this.delaysReal[0]) * -0.045567308 + (this.delaysReal[2] + this.delaysReal[3]) * 0.5508474 + this.delaysMiddleTapReal[this.delayMiddleTapIndex];
                    output[i / 2].imag = (this.delaysImag[1] + this.delaysImag[0]) * -0.045567308 + (this.delaysImag[2] + this.delaysImag[3]) * 0.5508474 + this.delaysMiddleTapImag[this.delayMiddleTapIndex];
                    this.delayIndex = 2;
                    break;
                case 2:
                    output[i / 2].real = (this.delaysReal[2] + this.delaysReal[1]) * -0.045567308 + (this.delaysReal[3] + this.delaysReal[0]) * 0.5508474 + this.delaysMiddleTapReal[this.delayMiddleTapIndex];
                    output[i / 2].imag = (this.delaysImag[2] + this.delaysImag[1]) * -0.045567308 + (this.delaysImag[3] + this.delaysImag[0]) * 0.5508474 + this.delaysMiddleTapImag[this.delayMiddleTapIndex];
                    this.delayIndex = 3;
                    break;
                case 3:
                    output[i / 2].real = (this.delaysReal[3] + this.delaysReal[2]) * -0.045567308 + (this.delaysReal[0] + this.delaysReal[1]) * 0.5508474 + this.delaysMiddleTapReal[this.delayMiddleTapIndex];
                    output[i / 2].imag = (this.delaysImag[3] + this.delaysImag[2]) * -0.045567308 + (this.delaysImag[0] + this.delaysImag[1]) * 0.5508474 + this.delaysMiddleTapImag[this.delayMiddleTapIndex];
                    this.delayIndex = 0;
                    break;
            }
        }
        return output;
    }

    /**
     * Filters the samples from the input sample packet and appends filter output to the output
     * sample packet. Stops automatically if output sample packet is full.
     * 
     * This method uses a half band low pass filter with 12 taps. It will decimate by 2 and
     * amplify the signal by 2. First 50% of the input signal frequency spectrum are protected
     * from aliasing (-30dB)
     */
    filterN12(input) {
        let output = (s => { let a = []; while (s-- > 0) a.push(new complex()); return a; })(input.length / 2);
        let outInd = 0
        for (let i = 0; i < input.length; i += 2) {
            this.delaysReal[this.delayIndex] = input[i].real;
            this.delaysImag[this.delayIndex] = input[i].imag;
            this.delaysMiddleTapReal[this.delayMiddleTapIndex] = input[i + 1].real;
            this.delaysMiddleTapImag[this.delayMiddleTapIndex] = input[i + 1].imag;
            this.delayMiddleTapIndex++;
            if (this.delayMiddleTapIndex >= 3) this.delayMiddleTapIndex = 0;
            switch ((this.delayIndex)) {
                case 0:
                    output[outInd].real = (this.delaysReal[0] + this.delaysReal[5]) * 0.018032677 + (this.delaysReal[1] + this.delaysReal[4]) * -0.11459156 + (this.delaysReal[2] + this.delaysReal[3]) * 0.59738594 + this.delaysMiddleTapReal[this.delayMiddleTapIndex];
                    output[outInd].imag = (this.delaysImag[0] + this.delaysImag[5]) * 0.018032677 + (this.delaysImag[1] + this.delaysImag[4]) * -0.11459156 + (this.delaysImag[2] + this.delaysImag[3]) * 0.59738594 + this.delaysMiddleTapImag[this.delayMiddleTapIndex];
                    this.delayIndex = 1;
                    break;
                case 1:
                    output[outInd].real = (this.delaysReal[1] + this.delaysReal[0]) * 0.018032677 + (this.delaysReal[2] + this.delaysReal[5]) * -0.11459156 + (this.delaysReal[3] + this.delaysReal[4]) * 0.59738594 + this.delaysMiddleTapReal[this.delayMiddleTapIndex];
                    output[outInd].imag = (this.delaysImag[1] + this.delaysImag[0]) * 0.018032677 + (this.delaysImag[2] + this.delaysImag[5]) * -0.11459156 + (this.delaysImag[3] + this.delaysImag[4]) * 0.59738594 + this.delaysMiddleTapImag[this.delayMiddleTapIndex];
                    this.delayIndex = 2;
                    break;
                case 2:
                    output[outInd].real = (this.delaysReal[2] + this.delaysReal[1]) * 0.018032677 + (this.delaysReal[3] + this.delaysReal[0]) * -0.11459156 + (this.delaysReal[4] + this.delaysReal[5]) * 0.59738594 + this.delaysMiddleTapReal[this.delayMiddleTapIndex];
                    output[outInd].imag = (this.delaysImag[2] + this.delaysImag[1]) * 0.018032677 + (this.delaysImag[3] + this.delaysImag[0]) * -0.11459156 + (this.delaysImag[4] + this.delaysImag[5]) * 0.59738594 + this.delaysMiddleTapImag[this.delayMiddleTapIndex];
                    this.delayIndex = 3;
                    break;
                case 3:
                    output[outInd].real = (this.delaysReal[3] + this.delaysReal[2]) * 0.018032677 + (this.delaysReal[4] + this.delaysReal[1]) * -0.11459156 + (this.delaysReal[5] + this.delaysReal[0]) * 0.59738594 + this.delaysMiddleTapReal[this.delayMiddleTapIndex];
                    output[outInd].imag = (this.delaysImag[3] + this.delaysImag[2]) * 0.018032677 + (this.delaysImag[4] + this.delaysImag[1]) * -0.11459156 + (this.delaysImag[5] + this.delaysImag[0]) * 0.59738594 + this.delaysMiddleTapImag[this.delayMiddleTapIndex];
                    this.delayIndex = 4;
                    break;
                case 4:
                    output[outInd].real = (this.delaysReal[4] + this.delaysReal[3]) * 0.018032677 + (this.delaysReal[5] + this.delaysReal[2]) * -0.11459156 + (this.delaysReal[0] + this.delaysReal[1]) * 0.59738594 + this.delaysMiddleTapReal[this.delayMiddleTapIndex];
                    output[outInd].imag = (this.delaysImag[4] + this.delaysImag[3]) * 0.018032677 + (this.delaysImag[5] + this.delaysImag[2]) * -0.11459156 + (this.delaysImag[0] + this.delaysImag[1]) * 0.59738594 + this.delaysMiddleTapImag[this.delayMiddleTapIndex];
                    this.delayIndex = 5;
                    break;
                case 5:
                    output[outInd].real = (this.delaysReal[5] + this.delaysReal[4]) * 0.018032677 + (this.delaysReal[0] + this.delaysReal[3]) * -0.11459156 + (this.delaysReal[1] + this.delaysReal[2]) * 0.59738594 + this.delaysMiddleTapReal[this.delayMiddleTapIndex];
                    output[outInd].imag = (this.delaysImag[5] + this.delaysImag[4]) * 0.018032677 + (this.delaysImag[0] + this.delaysImag[3]) * -0.11459156 + (this.delaysImag[1] + this.delaysImag[2]) * 0.59738594 + this.delaysMiddleTapImag[this.delayMiddleTapIndex];
                    this.delayIndex = 0;
                    break;
            }
            outInd++
        }
        return output;
    }
}