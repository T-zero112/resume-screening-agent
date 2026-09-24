import {
  EvaluationResultSchema,
  type CandidateFeatureSet,
  type EvaluationResult,
  type Feature,
  type Requirement,
  type RequirementEvaluation,
  type RequirementMatchStatus,
  type Scorecard,
} from "../schemas/index.js";

export function evaluateCandidate(featureSet: CandidateFeatureSet, scorecard: Scorecard): EvaluationResult {
  const featureByKey = new Map(featureSet.features.map((feature) => [feature.key, feature]));
  const requirementById = new Map(scorecard.requirements.map((requirement) => [requirement.id, requirement]));
  const requirementEvaluations = scorecard.requirements.map((requirement) =>
    evaluateRequirement(requirement, featureByKey),
  );
  const requirementEvaluationById = new Map(
    requirementEvaluations.map((evaluation) => [evaluation.requirementId, evaluation]),
  );

  const dimensions = scorecard.dimensions.map((dimension) => {
    const rules = dimension.scoringRules.map((rule) => {
      const evaluation = requirementEvaluationById.get(rule.requirementId);
      const awardedPoints = evaluation?.status === "matched" ? rule.maxPoints : 0;

      return {
        ruleId: rule.id,
        requirementId: rule.requirementId,
        description: rule.description,
        maxPoints: rule.maxPoints,
        awardedPoints,
        status: evaluation?.status ?? "needs_review",
      };
    });
    const score = roundScore(rules.reduce((sum, rule) => sum + rule.awardedPoints, 0));

    return {
      dimensionId: dimension.id,
      name: dimension.name,
      weight: dimension.weight,
      score,
      weightedScore: roundScore(score * dimension.weight),
      rules,
    };
  });

  const hardRequirementStatus = getHardRequirementStatus(scorecard.requirements, requirementEvaluationById);
  const reviewFlags = [
    ...scorecard.reviewFlagRules.map((flag) => ({
      id: flag.id,
      description: flag.description,
    })),
    ...requirementEvaluations
      .filter((evaluation) => evaluation.status === "needs_review")
      .map((evaluation) => ({
        id: `review-${evaluation.requirementId}`,
        description: `${evaluation.description} 需要人工复核：${evaluation.explanation}`,
      })),
  ];

  return EvaluationResultSchema.parse({
    schemaVersion: "evaluation-result.v1",
    candidateId: featureSet.candidateId,
    scorecardId: scorecard.id,
    jobId: scorecard.jobId,
    hardRequirementStatus,
    totalScore: roundScore(dimensions.reduce((sum, dimension) => sum + dimension.weightedScore, 0)),
    requirementEvaluations,
    dimensions,
    reviewFlags,
    generatedAt: new Date().toISOString(),
  });
}

function evaluateRequirement(requirement: Requirement, featureByKey: Map<string, Feature>): RequirementEvaluation {
  const matchedCondition = [requirement.condition, ...requirement.alternativeConditions]
    .map((condition) => ({ condition, feature: featureByKey.get(condition.featureKey) }))
    .find(({ condition, feature: candidateFeature }) =>
      candidateFeature ? evaluateCondition(candidateFeature.value, condition.operator, condition.expectedValue) : false,
    );

  if (matchedCondition?.feature) {
    return {
      requirementId: requirement.id,
      description: requirement.description,
      featureKey: matchedCondition.condition.featureKey,
      status: "matched",
      expectedValue: matchedCondition.condition.expectedValue,
      actualValue: matchedCondition.feature.value,
      featureLabel: matchedCondition.feature.label,
      featureDisplayValue: matchedCondition.feature.displayValue,
      evidenceRefs: matchedCondition.feature.evidenceRefs,
      explanation: `匹配：${matchedCondition.feature.label ?? matchedCondition.feature.key} = ${formatValue(matchedCondition.feature.value)}。`,
    };
  }

  const primaryFeature = featureByKey.get(requirement.condition.featureKey);

  if (!primaryFeature) {
    return {
      requirementId: requirement.id,
      description: requirement.description,
      featureKey: requirement.condition.featureKey,
      status: requirement.allowHumanReview ? "needs_review" : "not_matched",
      expectedValue: requirement.condition.expectedValue,
      evidenceRefs: [],
      explanation: `未找到 Feature：${requirement.condition.featureKey}。`,
    };
  }

  const matched = evaluateCondition(primaryFeature.value, requirement.condition.operator, requirement.condition.expectedValue);
  const status: RequirementMatchStatus = matched ? "matched" : "not_matched";

  return {
    requirementId: requirement.id,
    description: requirement.description,
    featureKey: requirement.condition.featureKey,
    status,
    expectedValue: requirement.condition.expectedValue,
    actualValue: primaryFeature.value,
    featureLabel: primaryFeature.label,
    featureDisplayValue: primaryFeature.displayValue,
    evidenceRefs: primaryFeature.evidenceRefs,
    explanation: matched
      ? `匹配：${primaryFeature.label ?? primaryFeature.key} = ${formatValue(primaryFeature.value)}。`
      : `未匹配：${primaryFeature.label ?? primaryFeature.key} 实际值为 ${formatValue(primaryFeature.value)}。`,
  };
}

function evaluateCondition(actualValue: unknown, operator: Requirement["condition"]["operator"], expectedValue: unknown): boolean {
  switch (operator) {
    case "exists":
      return actualValue !== undefined && actualValue !== null;
    case "eq":
      return actualValue === expectedValue;
    case "neq":
      return actualValue !== expectedValue;
    case "gt":
      return typeof actualValue === "number" && typeof expectedValue === "number" && actualValue > expectedValue;
    case "gte":
      return typeof actualValue === "number" && typeof expectedValue === "number" && actualValue >= expectedValue;
    case "lt":
      return typeof actualValue === "number" && typeof expectedValue === "number" && actualValue < expectedValue;
    case "lte":
      return typeof actualValue === "number" && typeof expectedValue === "number" && actualValue <= expectedValue;
    case "includes":
      if (Array.isArray(expectedValue)) {
        return expectedValue.includes(actualValue);
      }

      if (Array.isArray(actualValue)) {
        return actualValue.includes(expectedValue as never);
      }

      return typeof actualValue === "string" && typeof expectedValue === "string" && actualValue.includes(expectedValue);
  }
}

function getHardRequirementStatus(
  requirements: Requirement[],
  requirementEvaluationById: Map<string, RequirementEvaluation>,
) {
  const hardEvaluations = requirements
    .filter((requirement) => requirement.isHardRequirement)
    .map((requirement) => requirementEvaluationById.get(requirement.id));

  if (hardEvaluations.some((evaluation) => evaluation?.status === "not_matched")) {
    return "fail";
  }

  if (hardEvaluations.some((evaluation) => evaluation?.status === "needs_review" || !evaluation)) {
    return "needs_review";
  }

  return "pass";
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
