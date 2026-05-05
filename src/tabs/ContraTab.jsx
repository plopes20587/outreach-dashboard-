import { useState } from "react";
import { api } from "../lib/api";
import { useCopy } from "../hooks/useCopy";
import Card from "../components/Card";
import Field from "../components/Field";
import Button from "../components/Button";

export default function ContraTab() {
  const [posting, setPosting] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);
  const [copied, copy] = useCopy();

  async function handleGenerate() {
    if (!posting.trim()) return;
    setGenerating(true);
    setError(false);
    try {
      const data = await api.generateContra(posting);
      setResult(data);
    } catch (err) {
      console.error("generateContra:", err.message);
      setError(true);
    } finally {
      setGenerating(false);
    }
  }

  function handleClear() {
    setPosting("");
    setResult(null);
    setError(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Step 1: Posting input */}
      <Card step={1} title="Contra posting">
        <Field>
          <textarea
            rows={9}
            value={posting}
            onChange={(e) => setPosting(e.target.value)}
            placeholder="Paste the full Contra job posting here..."
          />
        </Field>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <Button
            variant="coral"
            onClick={handleGenerate}
            disabled={generating || !posting.trim()}
          >
            {generating ? "Generating..." : "Generate application message"}
          </Button>
          <Button variant="default" onClick={handleClear}>
            Clear
          </Button>
        </div>
        {error && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            Failed to generate message. Try again.
          </div>
        )}
      </Card>

      {/* Step 2: Generated result */}
      {result && (
        <Card step={2} title="Application message">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>
              Ready to copy into Contra
            </span>
            <Button variant="coral" onClick={() => copy(result.message)}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          <textarea
            style={{ border: "0.5px solid var(--coral-bd)" }}
            rows={10}
            value={result.message}
            readOnly
            onClick={(e) => e.target.select()}
          />

          <div className="divider" />

          <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 6 }}>
            Personalization notes
          </div>
          <div
            style={{
              border: "0.5px solid var(--border-2)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 12px",
              fontSize: "13px",
              lineHeight: "1.6",
              color: "var(--text-2)",
            }}
          >
            {result.notes}
          </div>

          <div style={{ marginTop: 10 }}>
            <Button variant="coral" onClick={handleGenerate} disabled={generating}>
              {generating ? "Generating..." : "Regenerate"}
            </Button>
          </div>
        </Card>
      )}

    </div>
  );
}
