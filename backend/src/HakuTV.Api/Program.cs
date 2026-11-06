using System.Security.Cryptography;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.OpenApi.Models;
using HakuTV.Api.Auth;
using HakuTV.Api.Controllers;
using HakuTV.Api.Media;
using HakuTV.Core.Identity;
using HakuTV.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(o =>
{
    // "Authorize" button in Swagger UI: paste an access token to call the protected endpoints.
    o.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT", In = ParameterLocation.Header,
    });
    o.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } }] = [],
    });
});
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddSingleton(TimeProvider.System);

// Packaged video (DASH/HLS manifests + segments) lives in media/packaged, outside the repo's git tracking.
var media = new MediaStorage(Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath,
    builder.Configuration["Media:PackagedRoot"] ?? "../../../media/packaged")));
Directory.CreateDirectory(media.PackagedRoot);
builder.Services.AddSingleton(media);

/* ---------- Auth ---------- */

var jwt = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
if (jwt.SigningKey.Length < 32)
{
    // No key configured. Development falls back to a random key per run: everything works, but access tokens die
    // with the process (the SPA silently gets a new one from the refresh cookie). Other environments refuse to start.
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException("Jwt:SigningKey (at least 32 characters) is not configured.");
    jwt.SigningKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
    Console.WriteLine("warn: Jwt:SigningKey not set, using a random key for this run. " +
                      "Set one: dotnet user-secrets set \"Jwt:SigningKey\" \"<48+ random chars>\" --project backend/src/HakuTV.Api");
}

var tokenService = new TokenService(jwt, TimeProvider.System);
builder.Services.AddSingleton(jwt);
builder.Services.AddSingleton(tokenService);
builder.Services.AddSingleton<IPasswordHasher<AccountLogin>, PasswordHasher<AccountLogin>>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;                 // keep "sub", "pid"... as they are in the token
        o.TokenValidationParameters = tokenService.ValidationParameters;
    });

builder.Services.AddAuthorizationBuilder()
    .AddPolicy(AuthClaims.ProfilePolicy, p => p.RequireAuthenticatedUser().RequireClaim(AuthClaims.ProfileId));

// Brute-force brake on login/register: 10 attempts per minute per IP (the per-account lockout is in SQL).
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(RateLimits.Auth, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();

    // Dev-only pages in wwwroot/dev, e.g. http://localhost:5080/dev/player-test/
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.UseCors();

// Serve packaged video at /media.
// Phase 6 puts an auth check in front of this; the DRM license endpoint protects the keys.
var contentTypes = new FileExtensionContentTypeProvider();
contentTypes.Mappings[".mpd"] = "application/dash+xml";
contentTypes.Mappings[".m3u8"] = "application/vnd.apple.mpegurl";
contentTypes.Mappings[".m4s"] = "video/iso.segment";
contentTypes.Mappings[".vtt"] = "text/vtt";

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(media.PackagedRoot),
    RequestPath = MediaStorage.RequestPath,
    ContentTypeProvider = contentTypes,
});

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
