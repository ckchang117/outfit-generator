"use client"

interface ExplanationSectionProps {
  title: string
  items: { label: string; weight: number; description: string }[]
}

function ExplanationSection({ title, items }: ExplanationSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium text-neutral-700">{title}</h3>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-3">
            <span className="inline-block px-2 py-0.5 bg-neutral-100 rounded text-sm font-medium text-neutral-700 min-w-[50px] text-center">
              {item.weight}%
            </span>
            <div className="flex-1">
              <div className="font-medium text-sm text-neutral-800">{item.label}</div>
              <div className="text-xs text-neutral-600 mt-0.5">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function VersatilityExplanation() {
  const factors = [
    {
      label: "Color Versatility",
      weight: 35,
      description: "Measures neutral and versatile colors (black, white, navy, denim) that pair well with everything"
    },
    {
      label: "Formality Range",
      weight: 35,
      description: "Items that work across multiple formality levels (casual to business)"
    },
    {
      label: "Category Balance",
      weight: 25,
      description: "Ratio of tops to bottoms - balanced wardrobes offer more outfit combinations"
    },
    {
      label: "Layering Options",
      weight: 5,
      description: "Outerwear pieces that extend outfit possibilities"
    }
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-700">
        The Versatility score measures how well your clothing items can mix and match to create multiple outfits.
      </p>
      
      <ExplanationSection title="Scoring Breakdown" items={factors} />
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
        <h4 className="font-medium text-blue-900 text-sm mb-1">How to improve:</h4>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>• Add more neutral-colored basics</li>
          <li>• Choose items that work for multiple occasions</li>
          <li>• Maintain a balanced ratio of tops and bottoms</li>
          <li>• Include versatile layering pieces</li>
        </ul>
      </div>
    </div>
  )
}

export function CohesionExplanation() {
  const factors = [
    {
      label: "Color Harmony",
      weight: 40,
      description: "Ideal is 3-10 unique colors for a versatile wardrobe"
    },
    {
      label: "Style Consistency",
      weight: 40,
      description: "Having 1-2 dominant style themes across your wardrobe"
    },
    {
      label: "Formality Coherence",
      weight: 20,
      description: "Balancing formal and casual pieces (mixed wardrobes are fine)"
    }
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-700">
        The Cohesion score evaluates how well your wardrobe pieces work together as a unified collection. This score is forgiving of diverse wardrobes.
      </p>
      
      <ExplanationSection title="Scoring Breakdown" items={factors} />
      
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mt-4">
        <h4 className="font-medium text-purple-900 text-sm mb-1">How to improve:</h4>
        <ul className="text-xs text-purple-800 space-y-1">
          <li>• Aim for 3-10 core colors in your palette</li>
          <li>• Develop 1-2 signature style themes</li>
          <li>• It's okay to have both formal and casual pieces</li>
          <li>• Focus on pieces that complement what you already own</li>
        </ul>
      </div>
    </div>
  )
}

export function CompletenessExplanation() {
  const factors = [
    {
      label: "Category Coverage",
      weight: 50,
      description: "Having substantial quantities in each category (10+ tops, 6+ bottoms, etc.)"
    },
    {
      label: "Occasion Readiness",
      weight: 30,
      description: "Coverage for 6+ different event types (casual, work, formal, athletic, etc.)"
    },
    {
      label: "Seasonal Coverage",
      weight: 20,
      description: "Having appropriate items for all four seasons"
    }
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-700">
        The Completeness score measures whether you have a fully stocked wardrobe with substantial variety. This is a high standard for comprehensive wardrobes.
      </p>
      
      <ExplanationSection title="Scoring Breakdown" items={factors} />
      
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
        <h4 className="font-medium text-amber-900 text-sm mb-1">High Standards:</h4>
        <p className="text-xs text-amber-800 mb-2">
          This score requires a substantial wardrobe:
        </p>
        <ul className="text-xs text-amber-800 space-y-1">
          <li>• 10+ tops for variety</li>
          <li>• 6+ bottoms for options</li>
          <li>• 3+ outerwear pieces</li>
          <li>• 5+ pairs of shoes</li>
          <li>• Partial credit is limited (50% items = 25% score)</li>
        </ul>
      </div>
      
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
        <h4 className="font-medium text-orange-900 text-sm mb-1">How to improve:</h4>
        <ul className="text-xs text-orange-800 space-y-1">
          <li>• Build up quantities in each essential category</li>
          <li>• Add pieces for missing occasion types</li>
          <li>• Ensure year-round wardrobe coverage</li>
          <li>• This is a long-term wardrobe building goal</li>
        </ul>
      </div>
    </div>
  )
}