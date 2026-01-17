const HowItWorks = () => {
  return (
    <section id="how-it-works" className="section how-it-works reveal">
      <div className="section-header">
        <h2>
          How it <span>Works</span>
        </h2>
        <p>Three simple steps to seamless sponsor integration.</p>
      </div>
      <div className="grid three-col">
        <div className="card step-card">
          <div className="step-number">01</div>
          <div className="step-icon">UP</div>
          <h3>Upload Main Audio</h3>
          <p>Drop your podcast episode or audio file. We support MP3 and WAV.</p>
        </div>
        <div className="card step-card">
          <div className="step-number">02</div>
          <div className="step-icon">AI</div>
          <h3>Paste Sponsor Text + Analyze</h3>
          <p>
            Enter your sponsor script. Our AI analyzes audio patterns and
            recommends optimal insertion points.
          </p>
        </div>
        <div className="card step-card">
          <div className="step-number">03</div>
          <div className="step-icon">OUT</div>
          <h3>Preview Slot + Export</h3>
          <p>Preview the seamless transition, then export your final MP3.</p>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
