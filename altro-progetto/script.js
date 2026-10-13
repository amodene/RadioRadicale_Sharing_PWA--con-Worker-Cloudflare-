document.getElementById("demo-btn").addEventListener("click", () => {
  const output = document.getElementById("demo-output");
  output.textContent = `Script autonomo eseguito con successo alle: ${new Date().toLocaleTimeString()}`;
});
