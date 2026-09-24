import {
  CandidateReviewSchema,
  type CandidateReview,
  type EvaluationResult,
} from "../schemas/index.js";

export function buildCandidateReview(evaluation: EvaluationResult, generatedAt = new Date().toISOString()): CandidateReview {
  const reviewItems = evaluation.requirementEvaluations.map((item) => ({
    requirementId: item.requirementId,
    description: item.description,
    status: item.status,
    featureKey: item.featureKey,
    featureLabel: item.featureLabel,
    featureDisplayValue: item.featureDisplayValue,
    explanation: item.explanation,
    evidenceQuotes: item.evidenceRefs.map((ref) => ref.quote).filter((quote): quote is string => Boolean(quote)),
  }));

  return CandidateReviewSchema.parse({
    schemaVersion: "candidate-review.v1",
    candidateId: evaluation.candidateId,
    scorecardId: evaluation.scorecardId,
    jobId: evaluation.jobId,
    totalScore: evaluation.totalScore,
    hardRequirementStatus: evaluation.hardRequirementStatus,
    dimensions: evaluation.dimensions.map((dimension) => ({
      dimensionId: dimension.dimensionId,
      name: dimension.name,
      score: dimension.score,
      weightedScore: dimension.weightedScore,
    })),
    matchedItems: reviewItems.filter((item) => item.status === "matched"),
    gapItems: reviewItems.filter((item) => item.status === "not_matched"),
    reviewItems: reviewItems.filter((item) => item.status === "needs_review"),
    reviewFlags: evaluation.reviewFlags,
    generatedAt,
  });
}
