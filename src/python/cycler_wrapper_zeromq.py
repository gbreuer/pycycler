import sys, os, time, queue, multiprocessing, threading
import fcsparser
from histogram_analysis import refined_analysis
import json
import pandas as pd
from multiprocessing import Process
import zmq

NUM_WORKERS = 6

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

	while True:
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

		out_q.put(ret)

def read_kbd_input(inputQueue):
    while (True):
        input_str = input()
        inputQueue.put(input_str)

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

	EXIT_COMMAND = 'KILL'
	inputQueue = queue.Queue()

	#inputThread = threading.Thread(target=read_kbd_input, args=(inputQueue,), daemon=True)
	#inputThread.start()

	#Use processes for heavy computation
	in_q = multiprocessing.Queue()
	out_q = multiprocessing.Queue()

	for i in range(NUM_WORKERS):
		worker = Process(target=process_request, args=(in_q,out_q,))
		worker.daemon = True
		worker.start()

	while True:
		#Prevents ZMQError when no messages have arrived.
		try:
			message = socket.recv(zmq.NOBLOCK)
			message = json.loads(message)

			print(message)

			if message:
				in_q.put(message)

		except:
			pass

		while not out_q.empty():
			response = out_q.get()
			socket.send_string(response)

		if not inputQueue.empty():
			input_str = inputQueue.get()
			if EXIT_COMMAND in input_str:
				inputQueue.close()
				break

		time.sleep(0.1)
