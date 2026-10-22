"use client";

import ActivityLogView from "../audit/ActivityLogView";

export default function ActivityLogPage() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <ActivityLogView />
    </div>
  );
}
