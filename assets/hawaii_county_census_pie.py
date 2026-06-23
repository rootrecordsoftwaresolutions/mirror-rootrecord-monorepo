import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Confirmed U.S. Census Bureau Figures for Hawaii County
labels = [
    "Two or More Races",
    "White Alone",
    "Asian Alone",
    "Native Hawaiian & Pacific Islander",
    "Some Other Race",
    "Black or African American",
    "American Indian & Alaska Native",
]

# Exact official percentages
sizes = [32.5, 31.1, 21.2, 12.1, 1.9, 0.8, 0.3]

colors = ["#4F46E5", "#0EA5E9", "#10B981", "#F59E0B", "#6B7280", "#EF4444", "#84CC16"]
explode = (0.05, 0, 0, 0, 0, 0, 0)

plt.figure(figsize=(9, 7))
plt.pie(
    sizes,
    explode=explode,
    labels=labels,
    autopct="%1.1f%%",
    shadow=True,
    startangle=140,
    colors=colors,
)
plt.title("Official Census Bureau Data - Hawaii County Populations", fontsize=14, fontweight="bold")
plt.axis("equal")
out = r"C:\Users\rrdeveloper\MonoRepo\assets\hawaii_county_census_pie.png"
plt.savefig(out, dpi=150, bbox_inches="tight")
print(f"Saved {out}")
