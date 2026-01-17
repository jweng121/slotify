const ValueProps = () => {
  return (
    <section className="section value-props reveal">
      <div className="section-header">
        <h2>
          Why <span>Slotify</span>?
        </h2>
        <p>Built for creators who value quality and authenticity.</p>
      </div>
      <div className="grid three-col">
        <div className="card feature-card">
          <div className="feature-icon">AI</div>
          <h3>AI Slot Recommendations</h3>
          <p>
            Advanced analysis detects topic transitions, pause boundaries, and
            audio energy valleys for optimal ad placement.
          </p>
        </div>
        <div className="card feature-card">
          <div className="feature-icon">MIC</div>
          <h3>Native Sponsor Reads</h3>
          <p>
            Sponsor ads are generated in the creator's own voice automatically,
            ensuring a seamless listening experience.
          </p>
        </div>
        <div className="card feature-card">
          <div className="feature-icon">MP3</div>
          <h3>One-Click Export</h3>
          <p>
            Preview transitions in real time and export your final audio, ready
            to upload anywhere.
          </p>
        </div>
      </div>
    </section>
  );
};

export default ValueProps;
