import { useState } from "react";
import Tabs from "./components/Tabs";
import OutreachTab from "./tabs/OutreachTab";
import PitchTab from "./tabs/PitchTab";

const TABS = [
  { id: "outreach", label: "Outreach" },
  { id: "pitch",    label: "Freelance Pitch" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("outreach");

  return (
    <div className="app-wrapper">
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
      {activeTab === "outreach" && <OutreachTab />}
      {activeTab === "pitch"    && <PitchTab />}
    </div>
  );
}
