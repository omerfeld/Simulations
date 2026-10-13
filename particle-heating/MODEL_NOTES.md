# Nanodiamond internal-heating calculator — physics and limitations

This is a standalone, no-build browser model for **nanodiamond internal/lattice temperature**, **not center-of-mass temperature**. The user-facing page is `particle-heating/index.html`. Its configuration can be downloaded/uploaded as JSON (`levitated-lab.nanodiamond-heating.v1`). It contains an optional 532-nm contribution in addition to the default 1560-nm illumination.

## Energy balance

At each operating point solve the monotonic equation

\[
  P_{\rm abs,1}+P_{\rm abs,2}=P_{\rm gas}(T)+P_{\rm rad}(T),\quad T\ge T_0.
\]

There is no heat conduction to a support: the particle is levitated. No laser-induced fluorescence/cooling or internal defect kinetics is modeled. Measured beam *power at the particle* is required (not laser-diode electrical power). The thermometric inversion requires an **independent internal-temperature** measurement, e.g. calibrated NV zero-field splitting or Raman thermometry.

### User-entered bulk absorption coefficient

Both illumination channels accept either the **bulk intensity-attenuation coefficient** `alpha` (in cm^-1 or m^-1) or the imaginary refractive index `k`, at that channel's vacuum wavelength. They are related by

\[
\alpha_{\rm bulk}[\mathrm{m}^{-1}] = \frac{4\pi k}{\lambda[\mathrm{m}]},
\qquad k = \frac{\alpha_{\rm bulk}\lambda}{4\pi}.
\]

`alpha` is defined by **bulk intensity** `I(z) = I(0) exp(-alpha*z)`, not field-amplitude attenuation, absorbed fraction of the incident beam, a nanodiamond-specific cross-section, or infrared emission loss. It is converted to `k` and then the original Rayleigh-sphere local-field correction is used to obtain `C_abs`. The code does **not** approximate the nanodiamond absorbed fraction as `1-exp(-alpha*2R)`.

Selecting a different unit does not alter the represented absorption. Changing wavelength while holding alpha fixed changes the corresponding `k`; changing wavelength while holding `k` fixed changes the equivalent alpha. Saved JSON profiles include the input mode and units as well as both derived numeric representations, and the loader remains compatible with original v1 JSON files containing only `k`. CSV exports include the current absorption values in cm^-1 and `k`.

### Optical absorption, Rayleigh approximation

For a sphere with radius `R`, laser wavelength `lambda`, complex refractive index `m = n + ik`, homogeneous surrounding index ~1,

\[
 C_{\mathrm{abs}} = \frac{8\pi^2R^3}{\lambda}
 \operatorname{Im}\left(\frac{m^2-1}{m^2+2}\right),
 \quad P_{\mathrm{abs}}= I(r_\perp) C_{\mathrm{abs}},
 \quad I(r_\perp) = \frac{2P}{\pi w_0^2}e^{-2r_\perp^2/w_0^2}.
\]

It uses **electric-dipole quasistatic absorption**, not Mie, the radiatively corrected dynamical polarizability, or a measured cross-section. It is inappropriate if the optical size parameter `x=2 pi R/lambda` is not ≪1. `k` is unknown and depends on impurity concentration, nanodiamond surface, wavelength, and laser exposure, so the example values are *not* validated for a specific batch. High-NA fields can be non-Gaussian; the NA beam waist proxy `w0=lambda/(pi NA)` is only a paraxial estimate. The two independent lasers are treated as incoherent absorption inputs and do not modify each other's absorption.

### Gas heat exchange (free molecular)

\[
 P_{\rm gas}= \alpha A \frac{p\bar{c}}{8T_0}\frac{\gamma+1}{\gamma-1}(T-T_0),\quad
 A=4\pi R^2,\quad \bar{c}=\sqrt{\frac{8k_BT_0}{\pi m_g}}.
\]

All pressures in the UI are **mbar**, converted internally with 1 mbar = 100 Pa. Accommodations are dimensionless, with α in [0,1]. Gamma uses diatomic ideal-gas `1.4` for N2/air and `5/3` for He. This assumes constant gas temperature and full free-molecular flow; warns approximately if `Kn=mean_free-path/R<10`. Changes in gas composition and temperature-dependent accommodation are neglected. At large pressures, use a transitional/continuum model instead.

### Thermal radiation (two options)

**Rayleigh thermal dipole model** assumes the complex dielectric polarizability factor is roughly constant across the relevant infrared spectrum, with user-entered `etaIR = Im[(epsilonIR-1)/(epsilonIR+2)]`. Kirchhoff/Planck integration yields

\[
 P_{\rm rad} = \frac{1536\pi^3\zeta(5)k_B^5}{h^4c^3}R^3\eta_{\rm IR}\left(T^5-T_0^5\right).
\]

This *spectrally constant IR response* is an effective approximation and not a measured material characteristic. IR behavior may change during heating and phase transitions. Equating the NIR absorption `k` to IR response is **not justified**. Without a nonzero IR loss factor or graybody emissivity, the model has no radiative dissipation. In gas-free vacuum with finite absorption and no radiation, no steady temperature exists; the UI indicates no finite equilibrium.

**Graybody comparison** assumes area emissivity `epsilon`:

\[
 P_{\rm rad} = 4\pi R^2 \epsilon\sigma (T^4-T_0^4).
\]

For deeply sub-wavelength particles this is usually a poorer microscopic assumption than the Rayleigh model, but useful for sensitivity analysis when only an effective emissivity is known.

### Inverse measurement mode

For independently measured `T_int`, compute required NIR power absorption `P_needed = P_gas(T)+P_rad(T)-P_abs,green` and solve for the NIR imaginary index `k` numerically within `0<=k<=1`, with real refractive index held fixed. This inversion **cannot simultaneously identify** IR emissivity, charge, radius, laser waist, pressure or accommodation, and is particularly degenerate at UHV. Fits can be highly biased by incorrect particle radius or optical intensity.

### Heat capacity and relaxation

\[
 \tau_{\rm local} = \frac{(4\pi/3)R^3\rho c_p}{\partial_T(P_{\rm gas}+P_{\rm rad})|_{T=T_{\rm eq}}}.
\]

This is a **linearization at equilibrium**, not a full transient or proof of a stable physical diamond at the calculated T. Temperature-driven graphitization, sublimation, oxidation, phonon emission, thermionic effects, photochemistry, and changing cross sections are out of scope. The customized threshold is a visual caution only; there is no universal critical graphitization temperature at UHV or in air.

## Validation guidance

1. At `P_laser=0`, `T_eq=T_gas` (assuming equal radiation surroundings).
2. In a gas-dominated regime with negligible thermal radiation, `T_eq-T0 ∝ P_laser / pressure`.
3. With pressure set to zero and IR loss factor >0, T approaches a radiation-limited plateau.
4. At the equilibrium root, `(P_gas+P_rad-P_abs)/P_abs` should be near zero.
5. The Rayleigh radiative factor can be cross-checked by numerically integrating `4*pi*B_lambda(T)*C_abs(lambda)` over wavelength, with `C_abs(lambda)=8*pi² R³ eta_IR/lambda`. The integral gives a `T^5` law and the coefficient used above.

## Research references

* Rahman et al., “Burning and graphitization of optically levitated nanodiamonds in vacuum,” *Scientific Reports* **6**, 21633 (2016). https://www.nature.com/articles/srep21633
* Hoang et al., “Electron spin control of optically levitated nanodiamonds in vacuum,” *Nature Communications* **7**, 12250 (2016). https://www.nature.com/articles/ncomms12250
* Frangeskou et al., “Pure nanodiamonds for levitated optomechanics in vacuum,” *New Journal of Physics* **20**, 043016 (2018). https://discovery.ucl.ac.uk/id/eprint/10053388/1/Frangeskou_2018_New_J._Phys._20_043016.pdf
* “Spin-Mechanics with Nitrogen-Vacancy Centers and Trapped Particles,” *Micromachines* **12**, 651 (2021). https://pmc.ncbi.nlm.nih.gov/articles/PMC8227763/
