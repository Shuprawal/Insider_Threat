import React from "react";

function DateFilter({ startDate, setStartDate, endDate, setEndDate, onRefresh }) {
  return (
    <div className="flex flex-col p-3 md:flex-row items-center gap-4 ">
      <div className="flex items-center gap-2">
        <label htmlFor="start" className="font-semibold">From:</label>
        <input
          type="date"
          id="start"
          className="bg-[#4a2f2c] border border-[#3d2d28] rounded px-2 py-1 text-white"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="end" className="font-semibold">To:</label>
        <input
          type="date"
          id="end"
          className="bg-[#2a1b17] border border-[#3d2d28] rounded px-2 py-1 text-white"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
        />
      </div>

      <button
        onClick={onRefresh}
        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-full"
      >
        🔄 Refresh Dashboard
      </button>
    </div>
  );
}

export default DateFilter;
