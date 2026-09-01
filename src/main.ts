import "./styles.css";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("<NAMA> stage root was not found.");
}

app.dataset.product = "<NAMA>";
