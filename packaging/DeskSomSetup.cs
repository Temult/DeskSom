using System;
using System.IO;
using System.IO.Compression;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Linq;

[assembly: AssemblyTitle("DeskSom Setup")]
[assembly: AssemblyDescription("DeskSom v0.2.0-rc.15 self-contained source installer")]
[assembly: AssemblyCompany("SomnerAI")]
[assembly: AssemblyProduct("DeskSom")]
[assembly: AssemblyVersion("0.2.0.15")]
[assembly: AssemblyFileVersion("0.2.0.15")]

namespace DeskSomFriendSetup {
 internal sealed class Entry {
   public string Name;
   public string Hash;
   public long Length;
 }
 internal static class Program {
   const string Version = "0.2.0-rc.15";
   const string ArchiveHash = "efde6022692f7ae593236ee286bac2fe3b864e5bb611379449e27a89250476a0";
   const string ManifestHash = "c7b0d25e6dc55290246082f1d53830fa24c8ff098ca8a7d861044a03b617ee6c";
   const string SourceCommit = "de10011818bb8345929b05df411377db1e418b8d";
   const string ResourceName = "DeskSom.Payload.zip";
   const int ExpectedSourceFiles = 161;
   const int ExpectedZipEntries = 162;
   static string Hex(byte[] b) { return BitConverter.ToString(b).Replace("-","").ToLowerInvariant(); }
   static string Hash(byte[] b) { using(var s=SHA256.Create()) return Hex(s.ComputeHash(b)); }
   static string FileHash(string p) {using(var s=SHA256.Create())using(var f=File.OpenRead(p)) return Hex(s.ComputeHash(f));}
   static void Check(bool truth,string message) {if(!truth) throw new InvalidDataException(message);}
   static string Subpath(string root,string name) {
     Check(!String.IsNullOrWhiteSpace(name) && !name.Contains("\\") && !name.Contains(":") && !name.StartsWith("/") && !name.EndsWith("/") &&
       !name.Contains("//") && !name.StartsWith("./"),"Unsafe archive entry.");
     var parts=name.Split('/');
     foreach(var p in parts)Check(p!="." && p!=".." && p.Length>0 && p.IndexOfAny(Path.GetInvalidFileNameChars())<0,"Unsafe source filename.");
     var target=Path.GetFullPath(Path.Combine(root,Path.Combine(parts)));
     Check(target.StartsWith(Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase),"Source path escapes extraction directory.");
     return target;
   }
   static void NoLinks(string p) {
     var x=Path.GetFullPath(p);
     while(x!=null && Directory.Exists(x)) {
       Check((File.GetAttributes(x)&FileAttributes.ReparsePoint)==0,"Linked destination folder is not supported.");
       x=Directory.GetParent(x)==null ? null : Directory.GetParent(x).FullName;
     }
   }
   static byte[] Embedded() {
     using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)) {
       Check(stream!=null,"Embedded source package missing.");
       using(var b=new MemoryStream()) { stream.CopyTo(b);var data=b.ToArray(); Check(Hash(data)==ArchiveHash,"Embedded source hash mismatch.");return data; }
     }
   }
   static Dictionary<string,Entry> Manifest(byte[] bytes) {
     Check(Hash(bytes)==ManifestHash,"Release manifest differs from qualified source.");
     var decoded=new JavaScriptSerializer().DeserializeObject(Encoding.UTF8.GetString(bytes)) as Dictionary<string,object>;
     Check(decoded!=null && decoded.ContainsKey("schemaVersion") && (string)decoded["schemaVersion"]=="desksom.release/v1","Unsupported manifest schema.");
     Check(decoded.ContainsKey("version")&&(string)decoded["version"]==Version,"Wrong release version.");
     var list=decoded["files"] as object[];
     Check(list!=null && list.Length==ExpectedSourceFiles,"Manifest file count changed.");
     var entries=new Dictionary<string,Entry>(StringComparer.OrdinalIgnoreCase);
     foreach(var row in list) {
       var m=row as Dictionary<string,object>;Check(m!=null,"Invalid manifest file.");
       string name=(string)m["path"];Subpath(@"C:\DESKSOM_EXTRACT_VERIFY",name);
       Check(!entries.ContainsKey(name),"Duplicate path in manifest.");
       entries[name]=new Entry{Name=name,Length=Convert.ToInt64(m["bytes"]),Hash=(string)m["sha256"]};
       Check(entries[name].Length>=0&&entries[name].Length<10000000L,"Oversize source file.");
     }
     return entries;
   }
   static void VerifyZip(ZipArchive zip,Dictionary<string,Entry> entries) {
     Check(zip.Entries.Count==ExpectedZipEntries,"Archive entry count differs from qualified source.");
     var found=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
     foreach(var item in zip.Entries) {
       string name=item.FullName; Subpath(@"C:\DESKSOM_EXTRACT_VERIFY",name);
       Check(found.Add(name),"Duplicate source entry.");
       Check(name=="release-manifest.json"||entries.ContainsKey(name),"Unreviewed extra ZIP member.");
       Check(item.Length<10000000L,"Oversize ZIP member.");
       // MS-DOS archives have no symlink entries. Refuse Unix symlink types.
       int mode=(item.ExternalAttributes>>16)&0xF000;
       Check(mode!=0xA000,"Symlinks are not valid installer entries.");
     }
     foreach(var name in entries.Keys)Check(found.Contains(name),"Manifest entry absent in ZIP.");
     Check(found.Contains("release-manifest.json"),"Manifest absent.");
   }
   static Dictionary<string,Entry> VerifiedEntries(byte[] payload) {
     using(var ms=new MemoryStream(payload,false))using(var zip=new ZipArchive(ms,ZipArchiveMode.Read,false)) {
       var manifest=zip.GetEntry("release-manifest.json");
       Check(manifest!=null,"Manifest missing.");
       byte[] bytes;
       using(var stm=manifest.Open())using(var b=new MemoryStream()) {stm.CopyTo(b);bytes=b.ToArray();}
       var entries=Manifest(bytes);VerifyZip(zip,entries);
       return entries;
     }
   }
   static void VerifyTree(string folder,Dictionary<string,Entry> entries) {
     Check(Directory.Exists(folder),"Source extraction not found.");
     NoLinks(folder);
     var all=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
     foreach(var file in Directory.GetFiles(folder,"*",SearchOption.AllDirectories)) {
       Check((File.GetAttributes(file)&FileAttributes.ReparsePoint)==0,"Linked source file.");
       var rel=file.Substring(folder.TrimEnd(Path.DirectorySeparatorChar).Length+1).Replace('\\','/');
       Check(all.Add(rel),"Duplicate file on disk.");
       if(rel=="release-manifest.json"){Check(FileHash(file)==ManifestHash,"Extracted manifest differs.");continue;}
       Check(entries.ContainsKey(rel),"Unreviewed additional file in source folder.");
       Check(new FileInfo(file).Length==entries[rel].Length&&FileHash(file)==entries[rel].Hash,"Extracted source bytes differ.");
     }
     Check(all.Count==ExpectedZipEntries,"Extracted file count differs from release.");
   }
   static void ExtractNew(byte[] payload,string target,Dictionary<string,Entry> entries) {
     target=Path.GetFullPath(target);
     Check(!Directory.Exists(target)&&!File.Exists(target),"Destination already exists. Nothing was overwritten.");
     string parent=Path.GetDirectoryName(target);
     Check(!String.IsNullOrWhiteSpace(parent),"Invalid destination.");
     NoLinks(parent);
     Directory.CreateDirectory(parent);
     NoLinks(parent);
     var stage=Path.Combine(parent,".desksom-stage-"+Guid.NewGuid().ToString("N"));
     Directory.CreateDirectory(stage);
     try {
       using(var mem=new MemoryStream(payload,false))using(var zip=new ZipArchive(mem,ZipArchiveMode.Read,false)) {
         VerifyZip(zip,entries);
         foreach(var item in zip.Entries) {
           var output=Subpath(stage,item.FullName);
           Directory.CreateDirectory(Path.GetDirectoryName(output));
           using(var from=item.Open())using(var to=new FileStream(output,FileMode.CreateNew,FileAccess.Write,FileShare.None))from.CopyTo(to);
           if(item.FullName=="release-manifest.json")Check(FileHash(output)==ManifestHash,"Manifest failed extraction.");
           else {
             var expected=entries[item.FullName];
             Check(new FileInfo(output).Length==expected.Length&&FileHash(output)==expected.Hash,"Source file failed extraction verification.");
           }
         }
       }
       VerifyTree(stage,entries);
       Check(!Directory.Exists(target)&&!File.Exists(target),"A different extraction appeared concurrently.");
       Directory.Move(stage,target);
       VerifyTree(target,entries);
     } finally {
       if(Directory.Exists(stage)) {
         // Only this run's fresh staging area is eligible for cleanup.
         Directory.Delete(stage,true);
       }
     }
   }
   static void Receipt(string file,string status,string target) {
     if(String.IsNullOrWhiteSpace(file))return;
     var data="{\"schema\":\"desksom.friend-exe/v1\",\"status\":\""+status+"\",\"version\":\""+Version+
        "\",\"taggedSourceCommit\":\""+SourceCommit+"\",\"embeddedZipSha256\":\""+ArchiveHash+
        "\",\"manifestSha256\":\""+ManifestHash+"\",\"sourceFiles\":"+ExpectedSourceFiles+
        ",\"setupStarted\":false,\"userCredentialsIncluded\":false}";
     using(var fileStream=new FileStream(Path.GetFullPath(file),FileMode.CreateNew,FileAccess.Write,FileShare.None))
     using(var writer=new StreamWriter(fileStream, new UTF8Encoding(false)))writer.Write(data);
   }
   [STAThread]
   static int Main(string[] args) {
     bool interactive=args.Length==0;
     try {
       byte[] payload=Embedded();
       var entries=VerifiedEntries(payload);
       if(args.Length>=1&&args[0]=="--verify"&&args.Length==3&&args[1]=="--receipt") {
         Receipt(args[2],"VERIFIED",null);return 0;
       }
       if(args.Length>=1&&args[0]=="--extract-test"&&args.Length==4&&args[2]=="--receipt") {
         ExtractNew(payload,args[1],entries);Receipt(args[3],"EXTRACTED_VERIFIED",args[1]);return 0;
       }
       if(!interactive)throw new ArgumentException("Unknown setup option.");
       if(Environment.OSVersion.Platform!=PlatformID.Win32NT||!Environment.Is64BitOperatingSystem)
         throw new InvalidOperationException("DeskSom requires 64-bit Windows.");
       using(var identity=WindowsIdentity.GetCurrent()) {
         var role=new WindowsPrincipal(identity);
         if(role.IsInRole(WindowsBuiltInRole.Administrator))
           throw new InvalidOperationException("Run DeskSom Setup as an ordinary Windows user, not as administrator.");
       }
       var answer=MessageBox.Show(
        "DeskSom connects ChatGPT to files and commands on this Windows PC.\n\n"+
        "This installer extracts the exact, hash-verified rc.15 release into your own profile and opens the DeskSom setup wizard. "+
        "No account keys, tunnel credentials or personal files are packaged.\n\n"+
        "IMPORTANT: Allowed folders limit direct file tools, not PowerShell or other terminal commands. "+
        "Terminal operations have the permissions of your Windows login.\n\n"+
        "Proceed to the DeskSom setup wizard?",
        "DeskSom v0.2.0-rc.15 | Private Windows setup",MessageBoxButtons.YesNo,MessageBoxIcon.Information);
       if(answer!=DialogResult.Yes)return 0;
       var local=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
       var target=Path.Combine(local,"DeskSom-Distributions",Version+"-"+ArchiveHash.Substring(0,12));
       if(Directory.Exists(target))VerifyTree(target,entries);
       else ExtractNew(payload,target,entries);
       var wizard=Path.Combine(target,"Start-DeskSom-GUI.ps1");
       Check(File.Exists(wizard),"Verified source has no setup wizard.");
       var shell=Path.Combine(Environment.SystemDirectory,"WindowsPowerShell","v1.0","powershell.exe");
       Check(File.Exists(shell),"Built-in Windows PowerShell is unavailable.");
       var start=new ProcessStartInfo();
       start.FileName=shell;
       start.Arguments="-NoProfile -STA -ExecutionPolicy Bypass -File \""+wizard+"\"";
       start.WorkingDirectory=target;
       start.UseShellExecute=false;
       Process.Start(start);
       return 0;
     } catch(Exception e) {
       if(interactive)MessageBox.Show("Setup stopped without changing an existing DeskSom installation.\n\n"+e.Message+
        "\n\nPlease inspect the release checksum or contact the maintainer.","DeskSom Setup",MessageBoxButtons.OK,MessageBoxIcon.Error);
       return 24;
     }
   }
 }
}
