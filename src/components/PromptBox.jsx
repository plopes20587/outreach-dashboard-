import { useCopy } from "../hooks/useCopy";
import Button from "./Button";

export default function PromptBox({ text }) {
  const [copied, copy] = useCopy();

  return (
    <div className="prompt-box">
      <div className="prompt-box-header">
        <span className="prompt-box-label">Paste into Claude</span>
        <Button variant="primary" onClick={() => copy(text)}>
          {copied ? "Copied!" : "Copy prompt"}
        </Button>
      </div>
      <textarea
        className="prompt-textarea"
        value={text}
        readOnly
        rows={14}
        onClick={(e) => e.target.select()}
      />
    </div>
  );
}
