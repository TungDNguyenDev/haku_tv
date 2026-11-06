using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using HakuTV.Api.Media;
using HakuTV.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddInfrastructure(builder.Configuration);

// Packaged video (DASH/HLS manifests + segments) lives in media/packaged, outside the repo's git tracking.
var media = new MediaStorage(Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath,
    builder.Configuration["Media:PackagedRoot"] ?? "../../../media/packaged")));
Directory.CreateDirectory(media.PackagedRoot);
builder.Services.AddSingleton(media);

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
// Later phases will put an auth check in front of this; the DRM license endpoint protects the keys.
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

app.UseAuthorization();
app.MapControllers();

app.Run();
