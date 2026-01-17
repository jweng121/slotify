export type Slot = {
  id: string;
  time: string;
  confidence: number;
  pros: string[];
  cons: string[];
  rationale: string;
};

type SlotCardsProps = {
  slots: Slot[];
  selectedId: string | null;
  onSelect: (slot: Slot) => void;
  onPreview: (slot: Slot) => void;
};

const SlotCards = ({ slots, selectedId, onSelect, onPreview }: SlotCardsProps) => {
  return (
    <div className="grid three-col slot-grid">
      {slots.map((slot, index) => {
        const isSelected = slot.id === selectedId;
        return (
          <div key={slot.id} className={`card slot-card ${isSelected ? "selected" : ""}`}>
            <div className="slot-header">
              <div>
                <p className="slot-label">Slot {index + 1}</p>
                <h3>{slot.time}</h3>
              </div>
              <span className="badge">{slot.confidence}%</span>
            </div>
            <p className="slot-rationale">{slot.rationale}</p>
            <ul className="slot-list">
              {slot.pros.map((pro) => (
                <li key={pro} className="pro">
                  + {pro}
                </li>
              ))}
              {slot.cons.map((con) => (
                <li key={con} className="con">
                  - {con}
                </li>
              ))}
            </ul>
            <div className="slot-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onPreview(slot)}
              >
                Preview Transition
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onSelect(slot)}
              >
                Select Slot
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SlotCards;
