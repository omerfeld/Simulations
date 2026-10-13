# Paul Trap Secular-Frequency Calculator — model notes

This tool is a standalone, dependency-free browser port **only of the "Secular Frequency Tool"** from the supplied `Trap_calculator.py` (not its separate stability calculators).

## Original workflow preserved

1. Enter a **single measured secular frequency** at the initial state, where **DC voltage is assumed to be 0 V**.
2. Infer the reference Mathieu parameter `q` from the measured beta, `beta = 2 f_sec / f_RF`, in the first stable Mathieu band.
3. Calibrate the combined effective ratio `Q eta_RF / m` from the initial RF voltage, drive and geometry.
4. Predict the secular frequency for new RF/DC/drive/geometry settings.

There are three modes: change RF with DC=0, change DC while preserving Mathieu q (automatically changing RF voltage when geometry or RF drive changes), or independently change both RF and DC.

## Mathematical model

Mathieu equation in dimensionless time `tau = Omega t/2`:

`d^2 x/dtau^2 + [a - 2 q cos(2 tau)] x = 0`.

For the original code's chosen sign/geometry conventions:

| Selected mode | F_a | F_q |
|---|---:|---:|
| 3D axial Z | +8 | -4 |
| 3D radial X/Y | -4 | +2 |
| Linear radial X/Y | -4 | +2 |

`q = (Q eta_RF/m) F_q V_RF / (d^2 Omega^2)`

`a = (Q eta_RF/m) (eta_DC/eta_RF) F_a U_DC / (d^2 Omega^2)`

`f_sec = beta f_RF/2`.

Here `V_RF` means **peak amplitude** (not Vpp or RMS). `Omega = 2 pi f_RF` and `d` is the original code's effective geometry scale under a `1/d^2` field-curvature model. The relative DC/RF geometry-efficiency ratio is an independently supplied assumption, default 1.

### Numerical characteristic exponent

Rather than finding a possibly spurious root of a truncated continued fraction, the browser integrates two independent Mathieu solutions over one period `tau ∈ [0, pi]`, forming a real 2×2 monodromy matrix `M`. In the stable Floquet region:

`beta_principal = acos(trace(M)/2) / pi`.

This produces a **principal Floquet quasifrequency** folded to `0 <= beta <= 1`. To guard against higher-band folding, the GUI also computes the first Mathieu band limits `a0(|q|) < a < b1(|q|)` by solving symmetric Fourier-basis tridiagonal eigenvalue problems with Sturm bisection. Stable higher-band states are labeled `Outside band` and are deliberately **not** reported as a first-band secular frequency. The pseudopotential result `beta ≈ sqrt(a + q²/2)` is displayed for comparison only.

## Issues addressed from the original code

- **Sign error for DC response in the axial inversion.** The source `solve_q_from_beta` returned a positive `q`, even though its 3D axial factor `F_q` is **negative** for positive charge. The inferred effective Q/m could therefore be spuriously negative and flip the sign of the `a` change with DC. The port reconstructs signed q from the selected geometry and charge sign.
- **Fixed q with changing drive/geometry.** The source tries to maintain constant Mathieu q by adjusting RF voltage. The port makes the required effective RF voltage explicit, even when `Omega` or `d` changes, rather than allowing silent user confusion.
- **First-band ambiguity.** A continued-fraction root in beta∈(0,1) is not a complete stability test. The port checks monodromy multipliers and explicitly rejects higher-band folded quasifrequencies.
- **Frequency units.** The Python UI displayed measured "ωs (kHz)" but used a **cyclic frequency** f (Hz or kHz), not angular frequency ω (rad/s). The port labels f_sec and f_RF unambiguously.
- **Parameter identifiability.** A single reference secular frequency does not uniquely determine physical charge-to-mass, RF geometry efficiency and effective electrode curvature separately. The displayed calibration is **Q η_RF / m** under the chosen geometric convention, not an independent mass/charge measurement.

## Validation performed

- Floquet exponents obtained from the port's fourth-order Runge-Kutta monodromy propagator were compared with an independent high-accuracy `scipy.integrate.solve_ivp` solution for these `(a,q)` values: `(0,0.1)`, `(0,0.5)`, `(0,0.9)`, `(0.035,0.3)`, `(-0.025,0.4)`, `(0.08,0.7)`. Absolute beta deviations were ≤ `1.6e-9` in those tests.
- First-band edges `a0(q)` and `b1(q)` were compared against `scipy.special.mathieu_a(0,q)` and `mathieu_b(1,q)` for `q={0,0.1,0.4,0.65,0.9,1.5,3,5,10}`. Deviations were under `3e-13`.
- Chromium functional tests covered default calibration, positive axial DC response, negative radial DC response, constant-q RF voltage scaling with drive, invalid beta input, large DC outside the first band, and inclusion of the page in the main simulation hub. No JavaScript errors were found in tested states.

## Limits — especially relevant for levitated nanodiamonds

The model assumes a *pure Paul trap* in the calibration reference. If the measured hybrid frequency includes optical tweezer stiffness, do not feed it here as a Paul-only reference without first correcting for the optical part. It also neglects DC offsets/multipole imperfections, nonquadrupole electrode geometry, coupling between axes, micromotion and nonlinear frequency shifts, laser forces, and dissipation. The fact that Floquet motion is linearly stable does not guarantee capture or robustness to noise.

## Authoritative references

- [NIST DLMF §28.2 — Mathieu characteristic exponents](https://dlmf.nist.gov/28.2)
- [NIST DLMF §28.17 — Stability of Mathieu solutions](https://dlmf.nist.gov/28.17)
- [NIST DLMF §28.34 — Numerical computation of Mathieu quantities](https://dlmf.nist.gov/28.34)
