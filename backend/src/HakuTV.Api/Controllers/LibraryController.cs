using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using HakuTV.Api.Auth;
using HakuTV.Core.Playback;

namespace HakuTV.Api.Controllers;

/// <summary>
/// The current profile's own data (Phase 4): watch progress (player heartbeat), My List and ratings.
/// The profile and its maturity limit come from the token (policy Profile), never from the request,
/// so a profile can only write its own rows, and only about titles it is allowed to see.
/// </summary>
[ApiController]
[Authorize(Policy = AuthClaims.ProfilePolicy)]
[Route("api")]
public sealed class LibraryController(ILibraryRepository library) : ControllerBase
{
    /// <summary>Longer than any real film or episode: a sanity bound on what the client sends.</summary>
    private const int MaxDurationSeconds = 24 * 60 * 60;

    /// <summary>
    /// Player heartbeat: PUT /api/progress { titleId, episodeId, positionSeconds, durationSeconds }.
    /// Sent every few seconds while playing, on pause/seek and when leaving the player.
    /// </summary>
    [HttpPut("progress")]
    public async Task<ActionResult<ProgressResponse>> SaveProgress(ProgressRequest request, CancellationToken ct)
    {
        if (request.DurationSeconds is <= 0 or > MaxDurationSeconds || request.PositionSeconds < 0)
            return BadRequest(new ApiError("invalid-progress", "Vị trí hoặc thời lượng không hợp lệ."));

        // The player may report a position a little past the duration it read earlier; the proc clamps it.
        var finished = await library.SaveProgressAsync(ProfileId, User.MaxMaturityAge(),
            new ProgressInput(request.TitleId, request.EpisodeId, (int)Math.Min(request.PositionSeconds, MaxDurationSeconds), (int)Math.Ceiling(request.DurationSeconds)), ct);

        return finished is { } isFinished ? Ok(new ProgressResponse(isFinished)) : TitleNotFound();
    }

    /// <summary>"Remove from Continue watching": DELETE /api/progress/12. Idempotent: nothing to remove is fine too.</summary>
    [HttpDelete("progress/{titleId:int}")]
    public async Task<IActionResult> RemoveProgress(int titleId, CancellationToken ct)
    {
        await library.RemoveProgressAsync(ProfileId, titleId, ct);
        return NoContent();
    }

    /// <summary>PUT /api/my-list/12 adds, DELETE removes. Both are idempotent.</summary>
    [HttpPut("my-list/{titleId:int}")]
    public Task<IActionResult> AddToMyList(int titleId, CancellationToken ct) => SetMyList(titleId, true, ct);

    [HttpDelete("my-list/{titleId:int}")]
    public Task<IActionResult> RemoveFromMyList(int titleId, CancellationToken ct) => SetMyList(titleId, false, ct);

    /// <summary>PUT /api/ratings/12 { rating: 1 | 2 | 3 | null } (null removes the rating).</summary>
    [HttpPut("ratings/{titleId:int}")]
    public async Task<IActionResult> Rate(int titleId, RatingRequest request, CancellationToken ct)
    {
        if (!TitleRating.IsValid(request.Rating))
            return BadRequest(new ApiError("invalid-rating", "Đánh giá không hợp lệ."));

        return await library.SetRatingAsync(ProfileId, User.MaxMaturityAge(), titleId, request.Rating, ct)
            ? NoContent()
            : TitleNotFound();
    }

    private async Task<IActionResult> SetMyList(int titleId, bool inList, CancellationToken ct) =>
        await library.SetMyListAsync(ProfileId, User.MaxMaturityAge(), titleId, inList, ct) ? NoContent() : TitleNotFound();

    // The Profile policy guarantees the claim.
    private int ProfileId => User.ProfileId() ?? throw new InvalidOperationException("No profile in token.");

    private NotFoundObjectResult TitleNotFound() => NotFound(new ApiError("title-not-found", "Không tìm thấy phim này."));
}

/// <summary>Seconds as the player reports them (fractions); stored as whole seconds.</summary>
public sealed record ProgressRequest(int TitleId, int? EpisodeId, double PositionSeconds, double DurationSeconds);

public sealed record ProgressResponse(bool IsFinished);

public sealed record RatingRequest(byte? Rating);
