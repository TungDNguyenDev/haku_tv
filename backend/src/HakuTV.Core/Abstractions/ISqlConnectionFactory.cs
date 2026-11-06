using System.Data.Common;

namespace HakuTV.Core.Abstractions;

/// <summary>
/// Creates open connections to SQL Server. Repositories call stored procedures through Dapper on these.
/// </summary>
public interface ISqlConnectionFactory
{
    Task<DbConnection> OpenAsync(CancellationToken ct = default);
}
