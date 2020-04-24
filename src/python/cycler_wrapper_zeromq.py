import sys, os, time, queue, multiprocessing, threading
import fcsparser
from histogram_analysis import refined_analysis
import json
import pandas as pd
from multiprocessing import Process
import zmq

NUM_WORKERS = 6
EXIT_COMMAND = 'KILL'
ALIVE_SIGNAL = json.dumps(['test'])

def load_all_files(options):
	stdout = []
	data = []

	property_name = options[2]
	output_filename = options[3]
	filenames = options[4:]

	data_dict = {}

	for filename in filenames:
		try:
			if (filename[-3:] == 'fcs'):
				meta, data = fcsparser.parse(filename)
				file_data = list(data[property_name])

			elif (filename[-3:] == 'csv'):
				df = pd.read_csv(filename)
				file_data = list(df[property_name])

			data_dict[filename] = file_data
		except:
			print("Loading "+property_name+" from "+filename+" failed. Check if property exists.")

	#return dict and average dict
	with open(output_filename, 'w') as f:
		f.write(json.dumps(data_dict))
		print("Data written to "+output_filename)

	return [output_filename]

def check_file(options):
	filename = options[2]
	stdout = []

	if (filename[-3:] == 'fcs'):
		meta, data = fcsparser.parse(filename)
		stdout.append(0)
		stdout.append(filename)
		stdout.append(list(data.columns))

	elif (filename[-3:] == 'csv'):
		df = pd.read_csv(filename)
		stdout.append(0)
		stdout.append(filename)
		stdout.append(list(df.columns))

	return stdout

def get_data(options):
	stdout = []
	property_name = options[2]

	filename = options[3]

	if (filename[-3:] == 'fcs'):
		meta, data = fcsparser.parse(filename)
		file_data = list(data[property_name])

	elif (filename[-3:] == 'csv'):
		df = pd.read_csv(filename)
		file_data = list(df[property_name])

	stdout = file_data

	return stdout

def get_preview(options):
	stdout = []
	data = []

	property_name = options[2]

	filenames = options[3:]

	for filename in filenames:
		if (filename[-3:] == 'fcs'):
			meta, data = fcsparser.parse(filename)
			file_data = list(data[property_name])

		elif (filename[-3:] == 'csv'):
			df = pd.read_csv(filename)
			file_data = list(df[property_name])

		data += file_data

	if len(data) > 5000:
		new_data = []
		for i in range(5000):
			new_data.append(data[int(random()*len(data))])

		data = new_data

	stdout += data
	return stdout

def run_analysis(options):
	stdout = []
	data = []

	property_name = options[2]

	g1_guess = float(options[3])
	g2_guess = float(options[4])
	low_lim = float(options[5])
	high_lim = float(options[6])

	filename = options[7]
	t0 = time.time()
	if options[8] != "":
		with open(options[8], 'r') as f:
			file_data = json.loads(f.read())
	else:
		if (filename[-3:] == 'fcs'):
			meta, data = fcsparser.parse(filename)
			file_data = list(data[property_name])

		elif (filename[-3:] == 'csv'):
			df = pd.read_csv(filename)
			file_data = list(df[property_name])

	img_filename = None
	if len(options) == 10:
		img_filename = options[9]

	t1 = time.time()
	stdout.append(filename)
	if (len(options) == 11):
		analysis_std = float(options[10])
		stdout.append(refined_analysis(file_data, low_lim, high_lim, g1_guess, g2_guess, stdev=analysis_std))
	else:
		stdout.append(refined_analysis(file_data, low_lim, high_lim, g1_guess, g2_guess))

	t2 = time.time()
	print("load time: "+str(t1-t0))
	print("analysis time: "+str(t2-t1))

	return stdout

def process_request(in_q, out_q):
	print("Worker started.")

	while in_q:
		try:
			message = in_q.get()
			method = message[0]
			args = ['']+message

			ret = json.dumps(['OK'])

			if method == 'check_file':
				ret = json.dumps(['check_file',check_file(args)])

			elif method == 'get_data':
				ret = json.dumps(['get_data',get_data(args)])

			elif method == 'get_preview':
				ret = json.dumps(['get_preview',get_data(args)])

			elif method == 'run_analysis':
				ret = json.dumps(['run_analysis',run_analysis(args)])

			elif method == 'load_all_files':
				ret = json.dumps(['load_all_files',load_all_files(args)])
		except:
			ret = json.dumps(['failed'])

		out_q.put(ret)

def clear_queue(queue):
	while not queue.empty():
		try:
			queue.get_nowait()
		except:
			continue

if __name__ == '__main__':
	multiprocessing.freeze_support()
	context = zmq.Context()
	socket = context.socket(zmq.PAIR)
	socket.bind("tcp://127.0.0.1:4242")

	#Wait for first message to connect
	print("Awaiting first message...")
	message = socket.recv()
	print("Connected. Starting worker processes...")
	socket.send_string(json.dumps(['OK']))

	exit_signal = False

	worker_list = []
	#Use processes for heavy computation
	in_q = multiprocessing.Queue()
	out_q = multiprocessing.Queue()

	for i in range(NUM_WORKERS):
		worker = Process(target=process_request, args=(in_q,out_q,))
		worker.daemon = True
		worker.start()
		worker_list.append(worker)

	try:
		timeout_timer = time.time()
		while True:
			#Prevents ZMQError when no messages have arrived.
			try:
				message = socket.recv(zmq.NOBLOCK)
				timeout_timer = time.time()

				message = json.loads(message)

				print(message)

				if message:
					in_q.put(message)

			except:
				pass

			while not out_q.empty():
				response = out_q.get()
				try:
					socket.send_string(response, flags=zmq.NOBLOCK)
				except:
					out_q.put_nowait(response)

			#Check if parent process terminated
			if time.time()-timeout_timer > 5.0:
				print("No response from application...")
				try:
					socket.send_string(ALIVE_SIGNAL, flags=zmq.NOBLOCK)
				except:
					out_q.put_nowait(ALIVE_SIGNAL)

			if time.time() - timeout_timer > 6.0:
				exit_signal = True

			if exit_signal:
				print("Exiting due to no response from application.")
				break

			time.sleep(0.1)

	finally:
		print("Exiting...")

		#Remove all elements from queues
		clear_queue(in_q)
		clear_queue(out_q)
		in_q.close()
		out_q.close()
		in_q = None
		out_q = None

		#Wait for workers to terminate and kill if stalled
		for w in worker_list:
			try:
				w.join(timeout=1)
			except:
				w.terminate()
