#!/bin/bash
pg_lsclusters | grep -q online || { pg_ctlcluster 16 main start 2>/dev/null; sleep 3; }
