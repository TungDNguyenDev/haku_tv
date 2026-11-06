using System.Data;
using System.Data.Common;
using System.Security.Cryptography;
using System.Transactions;
using Dapper;
using Microsoft.Data.SqlClient;
using HakuTV.Core.Abstractions;
using HakuTV.Infrastructure.Drm;

namespace HakuTV.Tests.Media;

/// <summary>
/// drm.usp_ContentKey_GetForPlayback through the real repository: a key is only handed out for the title it encrypts,
/// and only to a profile allowed to watch that title. Runs in a TransactionScope that is rolled back.
/// </summary>
[Trait("Category", "Database")]
[Collection(DatabaseCollection.Name)]
public class LicenseDbTests
{
    private const string ConnectionString =
        @"Server=.\SQLEXPRESS;Database=HakuTV;Trusted_Connection=True;TrustServerCertificate=True";

    private sealed class Factory : ISqlConnectionFactory
    {
        public async Task<DbConnection> OpenAsync(CancellationToken ct = default)
        {
            var conn = new SqlConnection(ConnectionString);
            await conn.OpenAsync(ct);
            return conn;
        }
    }

    [Fact]
    public async Task Keys_are_returned_only_for_their_title_and_an_allowed_profile()
    {
        using var scope = new TransactionScope(TransactionScopeOption.Required,
            new TransactionOptions { IsolationLevel = System.Transactions.IsolationLevel.ReadCommitted },
            TransactionScopeAsyncFlowOption.Enabled);

        var keyId = RandomNumberGenerator.GetBytes(16);
        var keyValue = RandomNumberGenerator.GetBytes(16);
        int lockedTitle, otherTitle;

        await using (var conn = await new Factory().OpenAsync())
        {
            await conn.ExecuteAsync("drm.usp_ContentKey_Upsert",
                new { MediaName = "license-test", KeyId = keyId, KeyValue = keyValue }, commandType: CommandType.StoredProcedure);

            Task<int> Title(int tmdbId, string cert) => conn.ExecuteScalarAsync<int>("catalog.usp_Title_UpsertFromJson",
                new { Json = $$"""{ "titleType": 1, "tmdbId": {{tmdbId}}, "originalTitle": "License test {{tmdbId}}", "certificationCountry": "US", "certificationCode": "{{cert}}" }""" },
                commandType: CommandType.StoredProcedure);

            lockedTitle = await Title(999000101, "R");     // 17+
            otherTitle = await Title(999000102, "G");      // all ages, but not encrypted with this key

            await conn.ExecuteAsync("media.usp_VideoAsset_Attach",
                new { TitleId = lockedTitle, MediaPath = "license-test-clearkey", KeyMediaName = "license-test" },
                commandType: CommandType.StoredProcedure);
        }

        var repo = new ContentKeyRepository(new Factory());

        var adult = await repo.GetForPlaybackAsync([keyId], lockedTitle, episodeId: null, maxMaturityAge: null);
        Assert.Equal(keyValue, Assert.Single(adult).KeyValue);

        Assert.Empty(await repo.GetForPlaybackAsync([keyId], otherTitle, null, null));                 // key of another title
        Assert.Empty(await repo.GetForPlaybackAsync([keyId], lockedTitle, null, maxMaturityAge: 12));   // Kids profile
        Assert.Empty(await repo.GetForPlaybackAsync([RandomNumberGenerator.GetBytes(16)], lockedTitle, null, null));   // unknown KID
    }
}
