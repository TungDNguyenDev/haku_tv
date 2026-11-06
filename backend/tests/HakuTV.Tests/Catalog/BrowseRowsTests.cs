using HakuTV.Core.Catalog;

namespace HakuTV.Tests.Catalog;

public class BrowseRowsTests
{
    private static (BrowseRowHeader, TitleCard) Item(byte rowOrder, string key, byte position, int titleId) =>
        (new BrowseRowHeader { RowOrder = rowOrder, RowKey = key, RowName = key.ToUpperInvariant(), Position = position },
         new TitleCard { TitleId = titleId, Name = $"T{titleId}" });

    [Fact]
    public void Groups_by_row_in_row_order_then_position()
    {
        var rows = BrowseRows.Group([
            Item(11, "genre-18", 1, 7),
            Item(1, "popular-movies", 2, 5),
            Item(1, "popular-movies", 1, 9),
            Item(11, "genre-18", 2, 9),     // the same title in two rows is allowed
        ]);

        Assert.Equal(["popular-movies", "genre-18"], rows.Select(r => r.Key));
        Assert.Equal([9, 5], rows[0].Items.Select(c => c.TitleId));
        Assert.Equal([7, 9], rows[1].Items.Select(c => c.TitleId));
        Assert.Equal("POPULAR-MOVIES", rows[0].Name);
        Assert.Equal("standard", rows[0].Layout);
    }

    [Fact]
    public void Empty_input_gives_no_rows() => Assert.Empty(BrowseRows.Group([]));

    [Theory]
    [InlineData(null, "vi")]
    [InlineData("", "vi")]
    [InlineData("EN", "en")]
    [InlineData(" en ", "en")]
    [InlineData("fr", "vi")]
    public void Language_falls_back_to_vietnamese(string? input, string expected) =>
        Assert.Equal(expected, CatalogLanguage.Normalize(input));
}
