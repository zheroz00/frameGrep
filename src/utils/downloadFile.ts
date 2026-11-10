/** Trigger a browser download of `blob` as a file named `filename`. */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** Trigger a browser download of `content` as a plain-text file named `filename`. */
export const downloadFile = (content: string, filename: string): void => {
  downloadBlob(new Blob([content], { type: 'text/plain' }), filename);
};
