import json, os, pathlib, shutil, subprocess, tempfile
assert os.geteuid() == 0
root=pathlib.Path(tempfile.mkdtemp(prefix='va-queue-parent-qualification-'))
producer,consumer,group=46006,46007,46006
try:
 os.chmod(root,0o755);work=root/'work';work.mkdir(mode=0o700);os.chown(work,producer,group);os.chmod(work,0o700)
 queue=work/'queue';queue.mkdir(mode=0o700);os.chown(queue,producer,group);os.chmod(queue,0o2770)
 private=work/'private';private.mkdir(mode=0o700);os.chown(private,producer,group);os.chmod(private,0o700)
 def probe(path):
  code='import os,sys; os.stat(sys.argv[1]); print("traversal-ok")'
  return subprocess.run(['setpriv','--reuid',str(consumer),'--regid',str(consumer),'--groups',str(group),'/usr/bin/python3','-c',code,str(path)],capture_output=True,text=True,timeout=10)
 blocked=probe(queue);assert blocked.returncode!=0 and 'PermissionError' in blocked.stderr
 os.chmod(work,0o710);allowed=probe(queue);denied=probe(private/'missing');assert allowed.returncode==0 and allowed.stdout.strip()=='traversal-ok';assert denied.returncode!=0 and 'PermissionError' in denied.stderr
 print(json.dumps({'fixture_only':True,'uid':consumer,'supplementary_gid':group,'parent_0700_queue_access':'denied','parent_0710_queue_access':'allowed','private_child_0700':'denied','production_host_or_accounts_modified':False}))
finally:
 assert root.parent==pathlib.Path(tempfile.gettempdir()) and root.name.startswith('va-queue-parent-qualification-');shutil.rmtree(root)

