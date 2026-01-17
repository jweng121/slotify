import { Link } from "react-router-dom";

const LandingHero = () => {
  const bars = Array.from({ length: 18 }, (_, index) => index);

  return (
    <section className="hero-section">
      <div className="hero-content">
        <div className="hero-copy reveal delay-1">
          <span className="pill">AI-Powered Audio Insertion</span>
          <h1>Slotify</h1>
          <p className="hero-subtitle">Seamless sponsor insertion for audio.</p>
          <p className="hero-text">
            Upload an episode, paste an ad read, and Slotify finds the best slot
            and inserts it naturally.
          </p>
          <div className="hero-actions">
            <Link to="/dashboard" className="btn btn-primary">
              Try Slotify
            </Link>
            <a href="#how-it-works" className="btn btn-ghost">
              How it Works
            </a>
          </div>
        </div>
        <div className="hero-visual reveal delay-2">
          <div className="waveform">
            {bars.map((bar) => (
              <span key={bar} className="wave-bar" />
            ))}
          </div>
          <div className="timeline-hero">
            <span>Main Audio</span>
            <div className="timeline-track">
              <span className="timeline-slot" />
            </div>
            <span>Sponsor Insert</span>
            <span>Main Audio</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingHero;
