import heroWave from "../assets/hero-wave.jpg";

const HeroBackground = () => {
  return (
    <div className="hero-background" aria-hidden="true">
      <img src={heroWave} alt="" className="hero-bg-image" />
      <div className="hero-overlay" />
      <div className="hero-vignette" />
    </div>
  );
};

export default HeroBackground;
