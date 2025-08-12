import React from 'react';

function ConfirmModal({ message, onConfirm, onCancel, confirmText = "Confirm", cancelText = "Cancel" }) {
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex items-center justify-center">
      <div className="bg-[#1a0e0b] text-white rounded-lg shadow-xl p-6 w-[90%] max-w-sm border border-[#444]">
        <h2 className="text-lg font-semibold mb-4 text-center">{message}</h2>
        <div className="flex justify-end space-x-4">
          <button
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
