class IirFilter {
    constructor(filterType, frequency, sampleRate, qualityFactor) {
        let num1 = 2.0 * Math.PI * frequency / sampleRate;
        let num2 = Math.Sin(num1) / (2.0 * qualityFactor);
        switch (filterType) {
            case IirFilterType.LowPass:
                this.b0 = ((1.0 - Math.Cos(num1)) / 2.0);
                this.b1 = (1.0 - Math.Cos(num1));
                this.b2 = ((1.0 - Math.Cos(num1)) / 2.0);
                this.a0 = (1.0 + num2);
                this.a1 = (-2.0 * Math.Cos(num1));
                this.a2 = (1.0 - num2);
                break;
            case IirFilterType.HighPass:
                this.b0 = ((1.0 + Math.Cos(num1)) / 2.0);
                this.b1 = -(1.0 + Math.Cos(num1));
                this.b2 = ((1.0 + Math.Cos(num1)) / 2.0);
                this.a0 = (1.0 + num2);
                this.a1 = (-2.0 * Math.Cos(num1));
                this.a2 = (1.0 - num2);
                break;
            case IirFilterType.Notch:
                this.b0 = 1;
                this.b1 = (-2.0 * Math.Cos(num1));
                this.b2 = 1;
                this.a0 = (1.0 + num2);
                this.a1 = (-2.0 * Math.Cos(num1));
                this.a2 = (1.0 - num2);
                break;
            default:
                this.b0 = num2;
                this.b1 = 0.0;
                this.b2 = -num2;
                this.a0 = (1.0 + num2);
                this.a1 = (-2.0 * Math.Cos(num1));
                this.a2 = (1.0 - num2);
                break;
        }
        this.b0 /= this.a0;
        this.b1 /= this.a0;
        this.b2 /= this.a0;
        this.a1 /= this.a0;
        this.a2 /= this.a0;
        this.x1 = 0.0;
        this.x2 = 0.0;
        this.y1 = 0.0;
        this.y2 = 0.0;
    }

    Reset() {
        this.x1 = 0.0;
        this.x2 = 0.0;
        this.y1 = 0.0;
        this.y2 = 0.0;
    }

    Process(sample) {
        let num = this.b0 * sample + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1;
        this.x1 = sample;
        this.y2 = this.y1;
        this.y1 = num;
        return num;
    }
}