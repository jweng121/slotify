import { Link } from "react-router-dom";

type DashboardHeaderProps = {
  onReset: () => void;
};

const DashboardHeader = ({ onReset }: DashboardHeaderProps) => {
  return (
    <header className="dashboard-header">
      <button type="button" className="btn btn-secondary" onClick={onReset}>
        + New Job
      </button>
      <Link to="/" className="logo-link" aria-label="Slotify home">
        <span className="logo">
          <span className="logo-mark">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 16.5C6.5 12.5 9.5 12.5 12 16.5C14.5 20.5 17.5 20.5 20 16.5"
                stroke="url(#slotify-gradient)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M4 7.5C6.5 11.5 9.5 11.5 12 7.5C14.5 3.5 17.5 3.5 20 7.5"
                stroke="url(#slotify-gradient)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient
                  id="slotify-gradient"
                  x1="4"
                  y1="4"
                  x2="20"
                  y2="20"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#8B5CF6" />
                  <stop offset="1" stopColor="#4F46E5" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span className="logo-text">Slotify</span>
        </span>
      </Link>
    </header>
  );
};

export default DashboardHeader;
