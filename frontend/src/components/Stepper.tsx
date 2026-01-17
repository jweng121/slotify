type StepperProps = {
  currentStep: "upload" | "analyze" | "preview" | "export";
};

const steps: Array<StepperProps["currentStep"]> = [
  "upload",
  "analyze",
  "preview",
  "export",
];

const stepLabels: Record<StepperProps["currentStep"], string> = {
  upload: "Upload",
  analyze: "Analyze",
  preview: "Preview",
  export: "Export",
};

const Stepper = ({ currentStep }: StepperProps) => {
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="stepper">
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isComplete = index < currentIndex;
        return (
          <div
            key={step}
            className={`step ${isActive ? "active" : ""} ${
              isComplete ? "complete" : ""
            }`}
          >
            <span className="step-dot" />
            <span className="step-label">{stepLabels[step]}</span>
            {index < steps.length - 1 && <span className="step-line" />}
          </div>
        );
      })}
    </div>
  );
};

export default Stepper;
