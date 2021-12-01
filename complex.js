class complex {
    constructor(real = 0, imag = 0) {
        this.real = real;
        this.imag = imag;
    }
    Modulus() {
        return Math.sqrt(this.ModulusSquared());
    }
    ModulusSquared() {
        return (this.real * this.real + this.imag * this.imag);
    }
    Argument() {
        return Math.atan2(this.imag, this.real);
    }
    Conjugate() {
        let comp = new complex();
        comp.real = this.real;
        comp.imag = -this.imag;
        return comp;
    }
    Normalize() {
        let comp = new complex();
        let mod = 1 / this.Modulus();
        comp.real = this.real * mod;
        comp.imag = this.imag * mod;
        return comp;
    }
    NormalizeFast() {
        let complex = new complex();
        let mod = 1 / this.ModulusSquared();
        complex.real = this.real * mod;
        complex.imag = this.imag * mod;
        return complex;
    }
    static FromAngle(angle) {
        let comp = new complex();
        comp.real = Math.cos(angle);
        comp.imag = Math.sin(angle);
        return comp;
    }
    add(b) {
        let comp = new complex();
        comp.real = this.real + b.real;
        comp.imag = this.imag + b.imag;
        return comp;
    }
    sub(b) {
        let comp = new complex();
        comp.real = this.real - b.real;
        comp.imag = this.imag - b.imag;
        return comp;
    }
    mul(b) {
        let comp = new complex();
        if (typeof b === 'number') {
            comp.real = this.real * b;
            comp.imag = this.imag * b;
        }
        else if (typeof b.real !== 'undefined' && typeof b.imag !== 'indefined') {
            comp.real = this.real * b.real - this.imag * b.imag;
            comp.imag = this.imag * b.real + this.real * b.imag;
        }
        return comp;
    }
    div(b) {
        let comp = new complex();
        if (typeof b === 'number') {
            b = 1 / b;
            comp.real = this.real * b;
            comp.imag = this.imag * b;
        }
        else if (typeof b.real !== 'undefined' && typeof b.imag !== 'indefined') {
            let num = 1 / (b.real * b.real + b.imag * b.imag);
            comp.real = (this.real * b.real + this.imag * b.imag) * num;
            comp.imag = (this.imag * b.real - this.real * b.imag) * num;
        }
        return comp;
    }
}