import { useState } from "react";
import Tabs from "./components/Tabs";
import LinkedInTab from "./tabs/LinkedInTab";
import ContraTab from "./tabs/ContraTab";

const TABS = [
  { id: "linkedin", label: "LinkedIn Outreach" },
  { id: "contra",   label: "Contra" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("linkedin");

  return (
    <div className="app-wrapper">
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
      {activeTab === "linkedin" && <LinkedInTab />}
      {activeTab === "contra"   && <ContraTab />}
    </div>
  );
}
