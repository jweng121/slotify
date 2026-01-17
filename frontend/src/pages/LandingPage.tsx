import HeroBackground from "../components/HeroBackground";
import HowItWorks from "../components/HowItWorks";
import LandingHero from "../components/LandingHero";
import ValueProps from "../components/ValueProps";

const LandingPage = () => {
  return (
    <div className="page landing">
      <section className="hero-shell">
        <HeroBackground />
        <LandingHero />
      </section>
      <div className="landing-content">
        <HowItWorks />
        <ValueProps />
        <footer className="site-footer">
          <span>Built for UofTHacks MVP</span>
          <span>No impersonation. Rights required.</span>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;
