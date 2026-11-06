using HakuTV.Core.Media;

namespace HakuTV.Tests.Media;

public class MediaAccessSignerTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 6, 12, 0, 0, TimeSpan.Zero);
    private readonly MediaAccessSigner _signer = new("test-secret-that-is-long-enough-0123456789");

    [Fact]
    public void A_cookie_opens_its_own_folder_until_it_expires()
    {
        var value = _signer.Create("sample-clearkey", Now.AddHours(6));

        Assert.True(_signer.IsValid("sample-clearkey", value, Now));
        Assert.True(_signer.IsValid("sample-clearkey", value, Now.AddHours(5)));
        Assert.False(_signer.IsValid("sample-clearkey", value, Now.AddHours(6).AddSeconds(1)));
    }

    [Fact]
    public void A_cookie_for_one_folder_does_not_open_another()
    {
        var value = _signer.Create("sample", Now.AddHours(1));
        Assert.False(_signer.IsValid("sample-clearkey", value, Now));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("garbage")]
    [InlineData(".abc")]
    [InlineData("99999999999.notASignature")]
    public void Missing_or_malformed_cookies_are_refused(string? value) =>
        Assert.False(_signer.IsValid("sample", value, Now));

    [Fact]
    public void Extending_the_expiry_by_hand_breaks_the_signature()
    {
        var value = _signer.Create("sample", Now.AddMinutes(1));
        var signature = value[(value.IndexOf('.') + 1)..];
        var forged = $"{Now.AddYears(1).ToUnixTimeSeconds()}.{signature}";

        Assert.False(_signer.IsValid("sample", forged, Now));
    }

    [Fact]
    public void Another_secret_does_not_validate_the_cookie()
    {
        var value = new MediaAccessSigner("another-secret-that-is-long-enough-987654").Create("sample", Now.AddHours(1));
        Assert.False(_signer.IsValid("sample", value, Now));
    }
}
