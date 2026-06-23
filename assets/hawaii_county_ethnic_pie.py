import matplotlib.pyplot as plt

# Data for Hawaii County Ethnic Groups
labels = [
    'Two or More Races',
    'White (Non-Hispanic)',
    'Asian',
    'Native Hawaiian & Pacific Islander',
    'Hispanic or Latino',
    'Other / Black',
]
sizes = [30, 31, 20, 12, 12, 1]
colors = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#6B7280']
explode = (0.05, 0, 0, 0, 0, 0)  # highlight the largest multiracial segment

plt.figure(figsize=(8, 6))
plt.pie(
    sizes,
    explode=explode,
    labels=labels,
    autopct='%1.0f%%',
    shadow=True,
    startangle=140,
    colors=colors,
)
plt.title('Ethnic Groups Population - Hawaii County', fontsize=14, fontweight='bold')
plt.axis('equal')
out = r'C:\Users\rrdeveloper\MonoRepo\assets\hawaii_county_ethnic_pie.png'
plt.savefig(out, dpi=150, bbox_inches='tight')
print(f'Saved {out}')
plt.show()
