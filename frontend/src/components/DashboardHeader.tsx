type DashboardHeaderProps = {
  onReset: () => void;
};

const DashboardHeader = ({ onReset }: DashboardHeaderProps) => {
  return (
    <header className="dashboard-header">
      <div className="logo">
        <span className="logo-mark">~</span>
        <span>Slotify</span>
      </div>
      <button type="button" className="btn btn-secondary" onClick={onReset}>
        + New Job
      </button>
    </header>
  );
};

export default DashboardHeader;
