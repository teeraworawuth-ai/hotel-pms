const text = "เธ เธŽเธฃเธฒเธ„เธฒเน เธ›เธฃเธœเธฑเธ™"; 
// This happens when UTF-8 bytes are read as Windows-874 / TIS-620.
// Node.js doesn't natively support Windows-874 encoding string extraction.
console.log(text);