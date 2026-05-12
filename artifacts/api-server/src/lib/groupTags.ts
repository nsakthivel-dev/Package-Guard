export const groupTagsMap: Record<string, string[]> = {
  "ML / AI": [
    "torch", "tensorflow", "numpy", "scikit-learn", "transformers",
    "keras", "xgboost", "lightgbm", "opencv-python", "pillow",
    "huggingface-hub", "diffusers", "accelerate", "datasets",
  ],
  "Data": [
    "pandas", "matplotlib", "seaborn", "plotly", "polars",
    "scipy", "statsmodels", "sqlalchemy", "pyarrow", "openpyxl",
  ],
  "Web": [
    "flask", "fastapi", "django", "requests", "httpx", "aiohttp",
    "uvicorn", "gunicorn", "starlette", "express", "axios",
    "cors", "dotenv", "nodemon",
  ],
  "Dev Tools": [
    "pytest", "black", "mypy", "flake8", "pylint", "isort",
    "pre-commit", "eslint", "prettier", "jest", "ts-node",
    "typescript", "webpack", "vite",
  ],
};

export function getGroupForPackage(name: string): string {
  const lower = name.toLowerCase();
  for (const [group, packages] of Object.entries(groupTagsMap)) {
    if (packages.includes(lower)) return group;
  }
  return "Others";
}
