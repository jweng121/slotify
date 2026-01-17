import HowItWorks from "../components/HowItWorks";
import LandingHero from "../components/LandingHero";
import ValueProps from "../components/ValueProps";

const LandingPage = () => {
  return (
    <div className="page landing">
      <LandingHero />
      <HowItWorks />
      <ValueProps />
      <footer className="site-footer">
        <span>Built for UofTHacks MVP</span>
        <span>No impersonation. Rights required.</span>
      </footer>
    </div>
  );
};

export default LandingPage;
