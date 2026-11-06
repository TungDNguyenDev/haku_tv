namespace HakuTV.Tests;

/// <summary>
/// xUnit runs test classes in parallel. The database tests write the same catalog rows (genres, people) inside
/// rolled-back transactions with UPDLOCK/SERIALIZABLE upserts, so in parallel they block or deadlock each other.
/// Classes in this collection run one after another.
/// </summary>
[CollectionDefinition(Name)]
public sealed class DatabaseCollection
{
    public const string Name = "Database";
}
